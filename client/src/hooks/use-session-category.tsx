import { useState, useEffect, useCallback } from "react";

const SESSION_CATEGORY_KEY = "helix_session_category";

export function useSessionCategory() {
  const [sessionCategory, setSessionCategoryState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(SESSION_CATEGORY_KEY);
    }
    return null;
  });

  useEffect(() => {
    if (sessionCategory) {
      sessionStorage.setItem(SESSION_CATEGORY_KEY, sessionCategory);
    } else {
      sessionStorage.removeItem(SESSION_CATEGORY_KEY);
    }
  }, [sessionCategory]);

  const setSessionCategory = useCallback((category: string | null) => {
    setSessionCategoryState(category);
  }, []);

  const clearSessionCategory = useCallback(() => {
    setSessionCategoryState(null);
    sessionStorage.removeItem(SESSION_CATEGORY_KEY);
  }, []);

  return {
    sessionCategory,
    setSessionCategory,
    clearSessionCategory,
  };
}
