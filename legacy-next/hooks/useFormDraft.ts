import { useState, useEffect, useCallback } from "react";

export function useFormDraft<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    } finally {
      setIsLoaded(true);
    }
  }, [key]);

  // Save to local storage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn(`Error writing localStorage key "${key}":`, error);
      }
    }
  }, [key, value, isLoaded]);

  // Clear draft
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setValue(initialValue);
    } catch (error) {
      console.warn(`Error clearing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [value, setValue, clearDraft] as const;
}
