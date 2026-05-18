import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, UserRole } from "../types";
import { auth, firestore } from "../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  isOfflineAuthProfileError,
  loadCachedUserProfile,
  loadUserProfile,
} from "../services/authProfile";
import { safeLogAnalyticsEvent } from "../services/analytics";
import { logActivity } from "../services/activityLog";

const SENSITIVE_STORAGE_PREFIXES = [
  "school_",
  "cached_user_profile_",
  "finance_page_",
  "financeFilters",
  "admin_dashboard_",
  "activity_monitor_cache_",
];

const clearSensitiveBrowserState = () => {
  if (typeof window === "undefined") return;

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (SENSITIVE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  });
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authLoading: boolean;
  error: React.ReactNode | null;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    // Listen for Firebase Auth changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);

      if (firebaseUser) {
        // Reset error on new attempt
        setError(null);
        setLoading(true);

        try {
          console.info("[Auth] Firebase user", {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
          });
          const userProfile = await loadUserProfile(firebaseUser);
          console.info("[Auth] user profile", userProfile);

          setUser(userProfile);

          if (userProfile.schoolId) {
            localStorage.setItem("lastSchoolId", userProfile.schoolId);
            localStorage.setItem("activeSchoolId", userProfile.schoolId);

            try {
              const schoolDoc = await getDoc(
                doc(firestore, "schools", userProfile.schoolId),
              );
              if (schoolDoc.exists()) {
                const schoolData = {
                  id: schoolDoc.id,
                  name: (schoolDoc.data() as any).name,
                  logoUrl: (schoolDoc.data() as any).logoUrl,
                };
                localStorage.setItem(
                  `persistent_school_branding_${userProfile.schoolId}`,
                  JSON.stringify(schoolData),
                );
                localStorage.setItem(
                  `school_${userProfile.schoolId}`,
                  JSON.stringify({ id: schoolDoc.id, ...schoolDoc.data() }),
                );
                window.dispatchEvent(new Event("school-branding-updated"));
              }
            } catch (schoolError) {
              console.warn("Failed to prefetch school branding", schoolError);
            }
          } else {
            localStorage.removeItem("lastSchoolId");
            localStorage.removeItem("activeSchoolId");
            sessionStorage.removeItem("lastSchoolId");
            sessionStorage.removeItem("activeSchoolId");
          }

          try {
            // Only update user document if it's not a parent (parents don't have user docs by default)
            if (userProfile.role !== UserRole.PARENT) {
              await updateDoc(doc(firestore, "users", firebaseUser.uid), {
                lastLoginAt: serverTimestamp(),
              });
            }
            await safeLogAnalyticsEvent({
              schoolId: userProfile.schoolId || null,
              actionType: "USER_LOGIN",
              userRole: userProfile.role || null,
              userId: userProfile.id || firebaseUser.uid,
            });
            await logActivity({
              schoolId: userProfile.schoolId || null,
              actorUid: userProfile.id || firebaseUser.uid || null,
              actorRole: userProfile.role || null,
              eventType: "user_login",
              entityId: userProfile.id || firebaseUser.uid,
              meta: {
                status: "success",
                module: "Authentication",
                actorName: userProfile.fullName || "",
                email: userProfile.email || "",
              },
            });
          } catch (updateError) {
            console.warn("Failed to update last login timestamp", updateError);
          }
        } catch (err: any) {
          const currentUid = auth.currentUser?.uid || null;
          if (currentUid !== firebaseUser.uid) {
            console.info("[Auth] Ignoring stale profile load error", {
              requestedUid: firebaseUser.uid,
              currentUid,
              error: err?.message || err,
            });
          } else {
            console.error("Error fetching user profile:", err);

            if (isOfflineAuthProfileError(err)) {
              const cachedProfile = loadCachedUserProfile(firebaseUser.uid);
              if (cachedProfile) {
                console.info("[Auth] Using cached user profile while offline", {
                  uid: firebaseUser.uid,
                  role: cachedProfile.role,
                });
                setUser(cachedProfile);
                if (cachedProfile.schoolId) {
                  localStorage.setItem("lastSchoolId", cachedProfile.schoolId);
                  localStorage.setItem("activeSchoolId", cachedProfile.schoolId);
                }
                setError(null);
                setAuthLoading(false);
                setLoading(false);
                return;
              }
            }

            setUser(null);

            // Improved Error Handling
            const errorMessage = err.message || err.toString();

            if (errorMessage === "ACCOUNT_NOT_PROVISIONED") {
              setError(
                "Your account is not set up yet. Please contact your administrator for access.",
              );
              // Sign out the user
              await signOut(auth);
            } else if (errorMessage === "ACCOUNT_INACTIVE") {
              setError(
                "Your account has been deactivated. Please contact your administrator for access.",
              );
              // Sign out the user
              await signOut(auth);
            } else if (errorMessage === "SCHOOL_NOT_FOUND") {
              setError(
                "Your school could not be found. Please contact your administrator.",
              );
              // Sign out the user
              await signOut(auth);
            } else if (errorMessage === "SCHOOL_INACTIVE") {
              setError(
                "Your school has been deactivated. Please contact your administrator.",
              );
              // Sign out the user
              await signOut(auth);
            } else if (
              errorMessage.includes("Cloud Firestore API has not been used")
            ) {
              setError(
                "CRITICAL ERROR: The Firestore Database is not enabled. Go to Firebase Console > Build > Firestore Database > Create Database.",
              );
            } else if (
              errorMessage.includes("permission-denied") ||
              errorMessage.includes("Missing or insufficient permissions")
            ) {
              setError(
                "Permission denied: database access is blocked by the current security rules. Contact your administrator to review the assigned permissions.",
              );
            } else if (
              errorMessage.includes("client is offline") ||
              errorMessage.includes("offline")
            ) {
              setError(
                "Network Error: Could not connect to the database. Check your internet connection.",
              );
            } else {
              setError(
                "Failed to load user profile. Please try refreshing the page. Error: " +
                  errorMessage,
              );
            }
          }
        }
      } else {
        setUser(null);
        setError(null);
        localStorage.removeItem("activeSchoolId");
        sessionStorage.removeItem("activeSchoolId");
        clearSensitiveBrowserState();
      }

      setAuthLoading(false);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setError(null);
      clearSensitiveBrowserState();
      // Force redirect to login on sign out
      if (typeof window !== "undefined") {
        window.location.hash = "#/login";
      }
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const updateUser = (patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authLoading,
        error,
        logout,
        updateUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
