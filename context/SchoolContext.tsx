import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { School } from "../types";
import { useAuth } from "./AuthContext";

interface SchoolContextType {
  school: School | null;
  schoolLoading: boolean;
  schoolError: string | null;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, isAuthenticated } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [cachedSchool, setCachedSchool] = useState<School | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: NodeJS.Timeout | null = null;

    const loadSchoolData = async () => {
      // reset immediately when user changes
      setSchool(null);
      setSchoolError(null);

      if (!isAuthenticated || !user || user.role === "super_admin") {
        setSchoolLoading(false);
        return;
      }

      if (!user.schoolId) {
        setSchoolLoading(false);
        setSchoolError("No school assigned to your account");
        return;
      }

      setSchoolLoading(true);

      const cacheKey = `school_${user.schoolId}`;
      const cached =
        sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);

      // Load from cache first for immediate display
      if (cached) {
        try {
          const parsedSchool = JSON.parse(cached);
          if (parsedSchool.status === "active" || parsedSchool.status === "trial_active") {
            if (!cancelled) setSchool(parsedSchool);
            if (!cancelled) setCachedSchool(parsedSchool);
          }
        } catch {
          sessionStorage.removeItem(cacheKey);
          localStorage.removeItem(cacheKey);
        }
      }

      try {
        // First do a direct get to check if document exists
        const schoolDocRef = doc(firestore, "schools", user.schoolId);
        const schoolDoc = await getDoc(schoolDocRef);

        if (!schoolDoc.exists()) {
          // School document doesn't exist yet - this is normal for brand new schools
          console.info("[SchoolContext] School document not found yet, will retry...", {
            schoolId: user.schoolId,
          });
          if (!cancelled) setSchoolLoading(false);
          
          // Retry after a delay
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              loadSchoolData();
            }
          }, 3000); // Retry after 3 seconds
          
          return;
        }

        const schoolData = {
          id: schoolDoc.id,
          ...schoolDoc.data(),
        } as School;

        if (schoolData.status !== "active" && schoolData.status !== "trial_active") {
          if (!cancelled)
            setSchoolError(
              "Your school is currently inactive. Please contact your administrator.",
            );
          if (!cancelled) setSchool(null);
          if (!cancelled) setSchoolLoading(false);
          return;
        }

        sessionStorage.setItem(cacheKey, JSON.stringify(schoolData));
        localStorage.removeItem(cacheKey);
        if (!cancelled) setSchool(schoolData);
        if (!cancelled) setCachedSchool(schoolData);
        window.dispatchEvent(new Event("school-branding-updated"));
        if (!cancelled) setSchoolLoading(false);

        // Now set up the listener for real-time updates
        unsubscribe = onSnapshot(
          schoolDocRef,
          (docSnap) => {
            if (!docSnap.exists()) {
              return; // Document deleted, keep showing cached data
            }

            const updatedSchoolData = {
              id: docSnap.id,
              ...docSnap.data(),
            } as School;

            if (updatedSchoolData.status !== "active" && updatedSchoolData.status !== "trial_active") {
              return; // Keep showing cached data
            }

            sessionStorage.setItem(cacheKey, JSON.stringify(updatedSchoolData));
            localStorage.removeItem(cacheKey);
            if (!cancelled) setSchool(updatedSchoolData);
            if (!cancelled) setCachedSchool(updatedSchoolData);
            window.dispatchEvent(new Event("school-branding-updated"));
          },
          (error: any) => {
            console.error("[SchoolContext] Snapshot error:", error);
            // Don't show error - we already have the data from initial fetch
          },
        );
      } catch (err: any) {
        console.error("Error loading school data:", err);
        if (!cancelled)
          setSchoolError("Failed to load school information. Please try refreshing the page.");
        if (!cancelled) setSchool(null);
        if (!cancelled) setSchoolLoading(false);
      }
    };

    loadSchoolData();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isAuthenticated, user?.id, user?.schoolId, user?.role]);

  return (
    <SchoolContext.Provider
      value={{
        school: school || cachedSchool,
        schoolLoading,
        schoolError,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error("useSchool must be used within a SchoolProvider");
  }
  return context;
};
