type Kind = 'light' | 'medium' | 'success' | 'warning';
const PATTERNS: Record<Kind, number | number[]> = { light: 8, medium: 16, success: [10, 40, 18], warning: [30, 50, 30] };

/** Haptic feedback where supported (Android/Chrome); elsewhere visual pop animations stand in. */
export function haptic(kind: Kind = 'light') {
  try { navigator.vibrate?.(PATTERNS[kind]); } catch { /* unsupported */ }
}
