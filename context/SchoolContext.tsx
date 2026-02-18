import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
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

    const loadSchoolData = () => {
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
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        try {
          const parsedSchool = JSON.parse(cached);
          if (parsedSchool.status === "active") {
            if (!cancelled) setSchool(parsedSchool);
            if (!cancelled) setCachedSchool(parsedSchool);
          }
        } catch {
          localStorage.removeItem(cacheKey);
        }
      }

      try {
        const schoolDocRef = doc(firestore, "schools", user.schoolId);
        const unsubscribe = onSnapshot(
          schoolDocRef,
          (schoolDoc) => {
            if (!schoolDoc.exists()) {
              if (!cancelled)
                setSchoolError(
                  "School not found. Please contact your administrator.",
                );
              if (!cancelled) setSchool(null);
              return;
            }

            const schoolData = {
              id: schoolDoc.id,
              ...schoolDoc.data(),
            } as School;

            if (schoolData.status !== "active") {
              if (!cancelled)
                setSchoolError(
                  "Your school is currently inactive. Please contact your administrator.",
                );
              if (!cancelled) setSchool(null);
              return;
            }

            localStorage.setItem(cacheKey, JSON.stringify(schoolData));
            if (!cancelled) setSchool(schoolData);
            if (!cancelled) setCachedSchool(schoolData);
            window.dispatchEvent(new Event("school-branding-updated"));
          },
          (error) => {
            console.error("Error loading school data:", error);
            if (!cancelled)
              setSchoolError(
                "Failed to load school information. Please try refreshing the page.",
              );
            if (!cancelled) setSchool(null);
          },
        );

        return () => unsubscribe();
      } finally {
        if (!cancelled) setSchoolLoading(false);
      }
    };

    const cleanup = loadSchoolData();
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
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
