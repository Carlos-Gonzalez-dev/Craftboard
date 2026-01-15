/**
 * Feature flags for hiding/showing features that are work-in-progress.
 * Set a flag to `true` to enable the feature, `false` to hide it.
 */
export const featureFlags = {
  /** Open Space buttons in QuickAccessButton (not working yet) */
  openSpaceButtons: false,
  /** Animated sparkles traveling along grid lines in background */
  gridSparkles: false,
} as const

export type FeatureFlag = keyof typeof featureFlags

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag]
}
