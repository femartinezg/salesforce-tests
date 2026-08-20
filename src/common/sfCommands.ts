import type { RunSfOptions } from './sfRunner';

export interface SfInvocation {
  args: string[];
  options?: RunSfOptions;
}

const LARGE_OUTPUT_OPTIONS: RunSfOptions = {
  maxBuffer: 100 * 1024 * 1024,
};

export type CoverageQueryObject =
  | 'ApexCodeCoverage'
  | 'ApexCodeCoverageAggregate'
  | 'ApexOrgWideCoverage';
export type CoverageDeleteObject = 'ApexCodeCoverage' | 'ApexCodeCoverageAggregate';

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

export function getCoverageRecordIdsInvocation(
  coverageObject: CoverageQueryObject,
  targetOrg: string
): SfInvocation {
  const validatedCoverageObject = validateCoverageQueryObject(coverageObject);
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  const coveredOnly =
    validatedCoverageObject === 'ApexCodeCoverageAggregate' ? ' WHERE NumLinesCovered > 0' : '';
  return {
    args: [
      'data',
      'query',
      '--query',
      `SELECT Id FROM ${validatedCoverageObject}${coveredOnly}`,
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
    options: LARGE_OUTPUT_OPTIONS,
  };
}

export function getDeleteCoverageRecordInvocation(
  coverageObject: CoverageDeleteObject,
  coverageRecordId: string,
  targetOrg: string
): SfInvocation {
  const validatedCoverageObject = validateCoverageDeleteObject(coverageObject);
  const validatedCoverageRecordId = validateCoverageRecordId(coverageRecordId);
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  return {
    args: [
      'data',
      'delete',
      'record',
      '--sobject',
      validatedCoverageObject,
      '--record-id',
      validatedCoverageRecordId,
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
  };
}

export function getUpdateOrgCoverageInvocation(
  coverageRecordId: string,
  targetOrg: string
): SfInvocation {
  const validatedCoverageRecordId = validateCoverageRecordId(coverageRecordId);
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  return {
    args: [
      'data',
      'update',
      'record',
      '--sobject',
      'ApexOrgWideCoverage',
      '--record-id',
      validatedCoverageRecordId,
      '--values',
      'PercentCovered=0',
      '--use-tooling-api',
      '--target-org',
      validatedTargetOrg,
      '--json',
    ],
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

function validateCoverageQueryObject(coverageObject: CoverageQueryObject): CoverageQueryObject {
  if (
    coverageObject !== 'ApexCodeCoverage'
    && coverageObject !== 'ApexCodeCoverageAggregate'
    && coverageObject !== 'ApexOrgWideCoverage'
  ) {
    throw new Error('Invalid Salesforce coverage data object');
  }
  return coverageObject;
}

function validateCoverageDeleteObject(coverageObject: CoverageDeleteObject): CoverageDeleteObject {
  if (coverageObject !== 'ApexCodeCoverage' && coverageObject !== 'ApexCodeCoverageAggregate') {
    throw new Error('Invalid Salesforce coverage data object');
  }
  return coverageObject;
}

function validateCoverageRecordId(coverageRecordId: string): string {
  if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(coverageRecordId)) {
    throw new Error('Invalid Salesforce coverage record ID');
  }
  return coverageRecordId;
}

function validateTargetOrg(targetOrg: string): string {
  if (typeof targetOrg !== 'string' || targetOrg.trim().length === 0) {
    throw new Error('Salesforce target org must be non-empty');
  }
  return targetOrg.trim();
}
