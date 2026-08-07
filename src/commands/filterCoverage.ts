import { getContextManager } from '../common';

export function showUnderCoveredClassesCommandHandler(): void {
  getContextManager().codeCoverageData.setUnderCoveredOnly(true);
}

export function showAllCoverageCommandHandler(): void {
  getContextManager().codeCoverageData.setUnderCoveredOnly(false);
}
