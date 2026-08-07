export type CoverageLevel = 'loading' | 'unavailable' | 'belowMinimum' | 'warning' | 'good';

export function getCoverageLevel(coverage: number | undefined): CoverageLevel {
  if (coverage === undefined) {
    return 'loading';
  }

  if (coverage < 0) {
    return 'unavailable';
  }

  if (coverage < 75) {
    return 'belowMinimum';
  }

  if (coverage < 85) {
    return 'warning';
  }

  return 'good';
}
