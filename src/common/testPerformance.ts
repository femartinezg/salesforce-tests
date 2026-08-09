export function isSlowTest(durationMs: number | undefined, thresholdMs: number): boolean {
  return (
    durationMs !== undefined
    && Number.isFinite(durationMs)
    && thresholdMs > 0
    && durationMs >= thresholdMs
  );
}
