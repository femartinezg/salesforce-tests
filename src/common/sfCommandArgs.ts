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
