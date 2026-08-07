export function buildRunTestClassArgs(testClassName: string, targetOrg: string): string[] {
  return [
    'apex',
    'run',
    'test',
    '--tests',
    testClassName,
    '--synchronous',
    '--code-coverage',
    '--json',
    '--target-org',
    targetOrg,
  ];
}
