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
export const TOOLING_COMPOSITE_BATCH_SIZE = 25;

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

export function getDeleteCoverageBatchInvocation(
  coverageObject: CoverageDeleteObject,
  coverageRecordIds: string[],
  targetOrg: string,
  apiVersion: string
): SfInvocation {
  const validatedCoverageObject = validateCoverageDeleteObject(coverageObject);
  if (
    !Array.isArray(coverageRecordIds)
    || coverageRecordIds.length === 0
    || coverageRecordIds.length > TOOLING_COMPOSITE_BATCH_SIZE
  ) {
    throw new Error(
      `Coverage Composite batch must contain between 1 and ${String(TOOLING_COMPOSITE_BATCH_SIZE)} records`
    );
  }
  const validatedCoverageRecordIds = coverageRecordIds.map(validateCoverageRecordId);
  const validatedTargetOrg = validateTargetOrg(targetOrg);
  const validatedApiVersion = validateApiVersion(apiVersion);
  const apiRoot = `/services/data/v${validatedApiVersion}`;
  return {
    args: [
      'api',
      'request',
      'rest',
      `${apiRoot}/tooling/composite`,
      '--method',
      'POST',
      '--body',
      JSON.stringify({
        allOrNone: false,
        compositeRequest: validatedCoverageRecordIds.map((id, index) => ({
          method: 'DELETE',
          url: `${apiRoot}/tooling/sobjects/${validatedCoverageObject}/${id}`,
          referenceId: `delete${String(index)}`,
        })),
      }),
      '--target-org',
      validatedTargetOrg,
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

function validateApiVersion(apiVersion: string): string {
  if (typeof apiVersion !== 'string' || !/^[1-9]\d*\.\d+$/.test(apiVersion)) {
    throw new Error('Salesforce API version must use numeric major.minor notation');
  }
  return apiVersion;
}

function validateTargetOrg(targetOrg: string): string {
  if (typeof targetOrg !== 'string' || targetOrg.trim().length === 0) {
    throw new Error('Salesforce target org must be non-empty');
  }
  return targetOrg.trim();
}
