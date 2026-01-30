import { auth, firestore } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";
import { User, UserRole } from "../types";

export interface UserProfile extends User {
  // Additional fields if needed
}

/**
 * Load user profile from Firestore users collection
 */
export async function loadUserProfile(
  firebaseUser: FirebaseUser,
): Promise<UserProfile> {
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
    const schoolId = userData.schoolId || null;
    const assignedClassIds = Array.isArray(userData.assignedClassIds)
      ? userData.assignedClassIds
      : [];

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
      if (schoolData?.status !== "active") {
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
      if (schoolData?.status !== "active") {
        throw new Error("SCHOOL_INACTIVE");
      }
    }

    return {
      id: firebaseUser.uid,
      fullName: userData.fullName || firebaseUser.displayName || "User",
      email: firebaseUser.email || "",
      role,
      schoolId,
      assignedClassIds,
      status: userStatus,
      createdAt: userData.createdAt?.toDate() || new Date(),
    };
  } else {
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
