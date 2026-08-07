export interface ApexStackLocation {
  className: string;
  line: number;
  column: number;
}

export function parseApexStackLocation(
  stackTrace: string | undefined
): ApexStackLocation | undefined {
  if (!stackTrace) {
    return undefined;
  }
  const match = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[^:\r\n]+: line (\d+), column (\d+)/.exec(
    stackTrace
  );
  if (!match) {
    return undefined;
  }
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
    return undefined;
  }
  return { className: match[1], line, column };
}
