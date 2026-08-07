export function buildRunTestClassArgs(testClassName: string, targetOrg?: string): string[] {
  const args = [
    'apex',
    'run',
    'test',
    '--tests',
    testClassName,
    '--synchronous',
    '--code-coverage',
    '--json',
  ];

  if (targetOrg) {
    args.push('--target-org', targetOrg);
  }

  return args;
}
