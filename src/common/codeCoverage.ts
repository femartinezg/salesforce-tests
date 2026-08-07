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

export function formatUncoveredLineSummary(
  uncoveredLineNumbers: readonly number[],
  limit = 20
): string {
  const visibleLines = uncoveredLineNumbers.slice(0, limit);
  const remaining = uncoveredLineNumbers.length - visibleLines.length;
  return `${visibleLines.join(', ')}${remaining > 0 ? ` … (+${remaining} more)` : ''}`;
}
