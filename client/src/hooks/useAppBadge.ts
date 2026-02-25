import { useCallback } from "react";

export function useAppBadge() {
  const isSupported = typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

  const setBadge = useCallback((count: number) => {
    if (!isSupported) return;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [isSupported]);

  const clearBadge = useCallback(() => {
    if (!isSupported) return;
    navigator.clearAppBadge().catch(() => {});
  }, [isSupported]);

  return { setBadge, clearBadge, isSupported };
}
