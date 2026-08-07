export type CoverageLevel = 'loading' | 'unavailable' | 'belowMinimum' | 'warning' | 'good';

export function getCoverageLevel(
  coverage: number | undefined,
  minimumCoverage = 75
): CoverageLevel {
  if (coverage === undefined) {
    return 'loading';
  }

  if (coverage < 0) {
    return 'unavailable';
  }

  if (coverage < minimumCoverage) {
    return 'belowMinimum';
  }

  if (coverage < Math.min(100, minimumCoverage + 10)) {
    return 'warning';
  }

  return 'good';
}
