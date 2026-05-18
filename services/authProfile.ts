import { auth, firestore } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";
import { User, UserRole } from "../types";

export interface UserProfile extends User {
  // Additional fields if needed
}

const USER_PROFILE_CACHE_PREFIX = "cached_user_profile_";

const getUserProfileCacheKey = (uid: string) => `${USER_PROFILE_CACHE_PREFIX}${uid}`;

export const cacheUserProfile = (profile: UserProfile) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getUserProfileCacheKey(profile.id),
      JSON.stringify({
        ...profile,
        createdAt:
          profile.createdAt instanceof Date
            ? profile.createdAt.toISOString()
            : profile.createdAt,
        cachedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("[Auth] Failed to cache user profile", error);
  }
};

export const loadCachedUserProfile = (uid: string): UserProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getUserProfileCacheKey(uid));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return {
      ...cached,
      createdAt: cached.createdAt ? new Date(cached.createdAt) : new Date(),
    };
  } catch (error) {
    console.warn("[Auth] Failed to load cached user profile", error);
    return null;
  }
};

export const isOfflineAuthProfileError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    typeof navigator !== "undefined" && !navigator.onLine
  ) || /offline|network|failed to fetch|unavailable|client is offline/i.test(message);
};

/**
 * Load user profile from Firestore users collection
 */
export async function loadUserProfile(
  firebaseUser: FirebaseUser,
): Promise<UserProfile> {
  // 1. Fetch Custom Claims (roles, studentIds, etc.) immediately
  let customClaims: any = {};
  try {
    const idTokenResult = await firebaseUser.getIdTokenResult(); // Allows cached auth state to work offline.
    customClaims = idTokenResult.claims || {};
    console.info("[Auth] Extracted custom claims:", customClaims);
  } catch (e) {
    console.warn("[Auth] Failed to fetch custom claims", e);
  }

  const userDocRef = doc(firestore, "users", firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists()) {
    const userData = userDoc.data();

    // Check if user account is active
    const userStatus = userData.status || "active";
    if (userStatus !== "active") {
      throw new Error("ACCOUNT_INACTIVE");
    }

    // Extract user data
    const role = userData.role as UserRole;
    const schoolId = typeof userData.schoolId === "string" ? userData.schoolId.trim() : (userData.schoolId || null);
    const assignedClassIds = Array.isArray(userData.assignedClassIds)
      ? userData.assignedClassIds
      : [];

    const phoneNumber = userData.phoneNumber || undefined;

    // For school_admin and teacher, schoolId is required
    if ((role === "school_admin" || role === "teacher") && !schoolId) {
      // Log details for debugging
      console.warn(
        `[AUTH] ${role === "teacher" ? "Teacher" : "School Admin"} account incomplete - missing schoolId`,
        {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role,
          hasSchoolId: !!schoolId,
        },
      );
      throw new Error(
        `${role === "teacher" ? "Teacher" : "School Admin"} account is incomplete: missing schoolId. Please contact your administrator.`,
      );
    }

    // For school admins, check if their school is active
    if (role === "school_admin" && schoolId) {
      const schoolDocRef = doc(firestore, "schools", schoolId);
      const schoolDoc = await getDoc(schoolDocRef);

      if (!schoolDoc.exists()) {
        throw new Error("SCHOOL_NOT_FOUND");
      }

      const schoolData = schoolDoc.data();
      if (schoolData?.status !== "active" && schoolData?.status !== "trial_active") {
        throw new Error("SCHOOL_INACTIVE");
      }
    }

    // For teachers, also check if school is active
    if (role === "teacher" && schoolId) {
      const schoolDocRef = doc(firestore, "schools", schoolId);
      const schoolDoc = await getDoc(schoolDocRef);

      if (!schoolDoc.exists()) {
        throw new Error("SCHOOL_NOT_FOUND");
      }

      const schoolData = schoolDoc.data();
      if (schoolData?.status !== "active" && schoolData?.status !== "trial_active") {
        throw new Error("SCHOOL_INACTIVE");
      }
    }

    const profile = {
      id: firebaseUser.uid,
      fullName: userData.fullName || firebaseUser.displayName || "User",
      email: firebaseUser.email || "",
      role: role || UserRole.PARENT,
      schoolId,
      phoneNumber,
      assignedClassIds,
      studentIds: customClaims.studentIds || [],
      status: userStatus,
      emailVerified: firebaseUser.emailVerified,
      photoUrl: userData.photoUrl || undefined,
      createdAt: userData.createdAt?.toDate() || new Date(),
    };
    cacheUserProfile(profile);
    return profile;
  } else {
    // If the user signed in with a phone number and doesn't have an explicit user record,
    // they are considered a Parent automatically.
    // Check if phoneNumber is set or if UID looks like a phone number (custom token flow)
    const isPhoneUid = firebaseUser.uid && firebaseUser.uid.startsWith("+") && firebaseUser.uid.length > 8;

    if (firebaseUser.phoneNumber || isPhoneUid) {
      const profile = {
        id: firebaseUser.uid,
        fullName: customClaims.parentContactName || "Parent / Guardian",
        email: "",
        role: UserRole.PARENT,
        schoolId: null,
        phoneNumber: customClaims.parentPhone || firebaseUser.phoneNumber || firebaseUser.uid,
        studentIds: customClaims.studentIds || [],
        parentContactRole: customClaims.parentContactRole,
        parentContactName: customClaims.parentContactName,
        assignedClassIds: [],
        status: "active" as const,
        emailVerified: false,
        createdAt: new Date(),
      };
      cacheUserProfile(profile);
      return profile;
    }
    // Account not provisioned - throw error
    throw new Error("ACCOUNT_NOT_PROVISIONED");
  }
}

/**
 * Require specific role, throws error if not authorized
 */
export function requireRole(
  user: UserProfile | null,
  requiredRoles: UserRole[],
): void {
  if (!user) {
    throw new Error("Authentication required");
  }

  if (!requiredRoles.includes(user.role)) {
    throw new Error(
      `Access denied. Required roles: ${requiredRoles.join(", ")}`,
    );
  }
}

/**
 * Require schoolId, throws error if not set or user is super admin
 */
export function requireSchoolId(user: UserProfile | null): string {
  if (!user) {
    throw new Error("Authentication required");
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    throw new Error("Super admin does not belong to a school");
  }

  if (!user.schoolId) {
    throw new Error(
      "School access required. Please contact your administrator.",
    );
  }

  return user.schoolId;
}

/**
 * Get active school ID, returns null for super admin
 */
export function getActiveSchool(user: UserProfile | null): string | null {
  if (!user) return null;

  if (user.role === UserRole.SUPER_ADMIN) return null;

  return user.schoolId;
}

/**
 * Check if user can access school data
 */
export function canAccessSchool(
  user: UserProfile | null,
  schoolId: string,
): boolean {
  if (!user) return false;

  // Super admin can access all schools
  if (user.role === UserRole.SUPER_ADMIN) return true;

  // Other users can only access their own school
  return user.schoolId === schoolId;
}
