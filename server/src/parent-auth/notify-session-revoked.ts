/**
 * Stub for future Expo push when a parent session is revoked on another device.
 * No-op unless EXPO_PUSH is configured later — does not block Phase 9.
 */
export async function notifySessionRevoked(_input: {
  parentId: string;
  revokedSessionId: string;
  reason: string;
}): Promise<void> {
  if (process.env.EXPO_PUSH_TOKEN || process.env.EXPO_PUSH === "1") {
    console.info(
      "[push stub] notifySessionRevoked skipped — Expo push not wired yet"
    );
  }
}
