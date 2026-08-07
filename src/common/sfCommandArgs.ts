export function buildRunTestClassArgs(testClassName: string, targetOrg: string): string[] {
  return buildRunTestSelectorArgs(testClassName, targetOrg);
}

export function buildRunTestMethodArgs(
  testClassName: string,
  testMethodName: string,
  targetOrg: string
): string[] {
  return buildRunTestSelectorArgs(`${testClassName}.${testMethodName}`, targetOrg);
}

export function buildRunTestSuiteArgs(testSuiteName: string, targetOrg: string): string[] {
  return [
    'apex',
    'run',
    'test',
    '--suite-names',
    testSuiteName,
    '--wait',
    '1',
    '--code-coverage',
    '--json',
    '--target-org',
    targetOrg,
  ];
}

export function buildRunTestLevelArgs(
  testLevel: 'RunLocalTests' | 'RunAllTestsInOrg',
  targetOrg: string
): string[] {
  return [
    'apex',
    'run',
    'test',
    '--test-level',
    testLevel,
    '--wait',
    '1',
    '--code-coverage',
    '--json',
    '--target-org',
    targetOrg,
  ];
}

export function buildRunTestSelectorArgs(testSelector: string, targetOrg: string): string[] {
  return [
    'apex',
    'run',
    'test',
    '--tests',
    testSelector,
    '--synchronous',
    '--code-coverage',
    '--json',
    '--target-org',
    targetOrg,
  ];
}
