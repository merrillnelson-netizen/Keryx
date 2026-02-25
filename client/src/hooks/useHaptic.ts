const patterns = {
  tap: [10],
  success: [50],
  warning: [100, 50, 100],
} as const;

type HapticPattern = keyof typeof patterns;

function vibrate(pattern: HapticPattern) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(patterns[pattern]);
  }
}

export function useHaptic() {
  return { vibrate };
}
