import type { RunSfOptions } from './sfRunner';

export interface SfInvocation {
  args: string[];
  options?: RunSfOptions;
}

const LARGE_OUTPUT_OPTIONS: RunSfOptions = {
  maxBuffer: 100 * 1024 * 1024,
};

export function getOrgInfoInvocation(): SfInvocation {
  return {
    args: ['org', 'display', '--json'],
  };
}

export function getApexClassesInvocation(targetOrg: string): SfInvocation {
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  return {
    args: [
      'data',
      'query',
      '--query',
      "SELECT Id, Name, Body FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC",
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
    options: LARGE_OUTPUT_OPTIONS,
  };
}

export function getCodeCoverageInvocation(targetOrg: string): SfInvocation {
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  return {
    args: [
      'data',
      'query',
      '--query',
      'SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate',
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
    options: LARGE_OUTPUT_OPTIONS,
  };
}

export function getTestClassInvocation(testClassName: string, targetOrg: string): SfInvocation {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(testClassName)) {
    throw new Error('Invalid Salesforce test class name');
  }
  const validatedTargetOrg = validateTargetOrg(targetOrg);

  return {
    args: [
      'apex',
      'test',
      'run',
      '--tests',
      testClassName,
      '--synchronous',
      '--code-coverage',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
    options: LARGE_OUTPUT_OPTIONS,
  };
}

export function getOrgCoverageInvocation(targetOrg: string): SfInvocation {
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  return {
    args: [
      'data',
      'query',
      '--query',
      'SELECT Id, PercentCovered FROM ApexOrgWideCoverage',
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
  };
}

function validateTargetOrg(targetOrg: string): string {
  if (typeof targetOrg !== 'string' || targetOrg.trim().length === 0) {
    throw new Error('Salesforce target org must be non-empty');
  }
  return targetOrg.trim();
}
