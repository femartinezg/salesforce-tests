import { getContextManager } from '../common';

export function clearTestRuns(): void {
  getContextManager().statusData.clearTestRuns();
}
