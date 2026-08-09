export interface ExportableTestResult {
  selector: string;
  status: 'Passed' | 'Failed';
  durationMs?: number;
  failureMessage?: string;
  failureStackTrace?: string;
}

export function serializeTestResultsJson(results: readonly ExportableTestResult[]): string {
  return `${JSON.stringify({ version: 1, tests: results }, null, 2)}\n`;
}

export function serializeTestResultsJunit(results: readonly ExportableTestResult[]): string {
  const failures = results.filter((result) => result.status === 'Failed').length;
  const totalTimeSeconds =
    results.reduce((total, result) => total + (result.durationMs ?? 0), 0) / 1000;
  const testCases = results.map((result) => serializeTestCase(result)).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="Salesforce Apex Tests" tests="${results.length}" failures="${failures}" time="${totalTimeSeconds.toFixed(3)}">`,
    testCases,
    '</testsuite>',
    '',
  ].join('\n');
}

function serializeTestCase(result: ExportableTestResult): string {
  const separator = result.selector.lastIndexOf('.');
  const className = separator >= 0 ? result.selector.slice(0, separator) : result.selector;
  const methodName = separator >= 0 ? result.selector.slice(separator + 1) : result.selector;
  const durationSeconds = (result.durationMs ?? 0) / 1000;
  const attributes =
    `classname="${escapeXml(className)}" name="${escapeXml(methodName)}" `
    + `time="${durationSeconds.toFixed(3)}"`;
  if (result.status === 'Passed') {
    return `  <testcase ${attributes}/>`;
  }

  const failureMessage = result.failureMessage ?? 'Apex test failed';
  const failureBody = [failureMessage, result.failureStackTrace].filter(Boolean).join('\n');
  return [
    `  <testcase ${attributes}>`,
    `    <failure message="${escapeXml(failureMessage)}">${escapeXml(failureBody)}</failure>`,
    '  </testcase>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
