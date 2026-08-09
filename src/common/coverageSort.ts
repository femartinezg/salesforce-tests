export interface CoverageSortable {
  name: string;
  codeCoverage?: number;
}

export function sortByActionableCoverage<T extends CoverageSortable>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftRank = coverageRank(left.codeCoverage);
    const rightRank = coverageRank(right.codeCoverage);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (leftRank === 0 && left.codeCoverage !== right.codeCoverage) {
      return (left.codeCoverage ?? 0) - (right.codeCoverage ?? 0);
    }
    return left.name.localeCompare(right.name);
  });
}

export function filterByCoverageThreshold<T extends CoverageSortable>(
  items: readonly T[],
  threshold: number
): T[] {
  return items.filter(
    (item) =>
      item.codeCoverage !== undefined && item.codeCoverage >= 0 && item.codeCoverage < threshold
  );
}

function coverageRank(coverage: number | undefined): number {
  if (coverage === undefined) {
    return 2;
  }
  return coverage < 0 ? 1 : 0;
}
