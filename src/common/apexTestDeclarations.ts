export interface ApexTestDeclaration {
  kind: 'class' | 'method';
  name: string;
  start: number;
  length: number;
}

export function findApexTestDeclarations(
  source: string,
  className: string,
  methodNames: readonly string[]
): ApexTestDeclaration[] {
  const searchableSource = maskCommentsAndStrings(source);
  const declarations: ApexTestDeclaration[] = [];
  const classDeclaration = findDeclaration(
    searchableSource,
    new RegExp(`\\bclass\\s+${escapeRegExp(className)}\\b`, 'i'),
    className
  );

  if (classDeclaration !== undefined) {
    declarations.push({
      kind: 'class',
      name: className,
      start: classDeclaration,
      length: className.length,
    });
  }

  for (const methodName of new Set(methodNames)) {
    const methodDeclaration = findDeclaration(
      searchableSource,
      new RegExp(`\\bvoid\\s+${escapeRegExp(methodName)}\\s*\\(`, 'i'),
      methodName
    );
    if (methodDeclaration !== undefined) {
      declarations.push({
        kind: 'method',
        name: methodName,
        start: methodDeclaration,
        length: methodName.length,
      });
    }
  }

  return declarations.sort((left, right) => left.start - right.start);
}

function findDeclaration(source: string, pattern: RegExp, name: string): number | undefined {
  const match = pattern.exec(source);
  if (match?.index === undefined) {
    return undefined;
  }
  return match.index + match[0].toLowerCase().lastIndexOf(name.toLowerCase());
}

function maskCommentsAndStrings(source: string): string {
  // VS Code positions use UTF-16 offsets. Keep one array entry per code unit so
  // non-BMP characters in comments or strings cannot shift later CodeLens ranges.
  const result = source.split('');
  let position = 0;

  while (position < result.length) {
    if (source[position] === '/' && source[position + 1] === '/') {
      position = maskUntilLineEnd(source, result, position);
      continue;
    }
    if (source[position] === '/' && source[position + 1] === '*') {
      position = maskBlockComment(source, result, position);
      continue;
    }
    if (source[position] === "'") {
      position = maskString(source, result, position);
      continue;
    }
    position++;
  }

  return result.join('');
}

function maskUntilLineEnd(source: string, result: string[], start: number): number {
  let position = start;
  while (position < source.length && source[position] !== '\n' && source[position] !== '\r') {
    result[position] = ' ';
    position++;
  }
  return position;
}

function maskBlockComment(source: string, result: string[], start: number): number {
  let position = start;
  while (position < source.length) {
    if (source[position] !== '\n' && source[position] !== '\r') {
      result[position] = ' ';
    }
    if (source[position] === '*' && source[position + 1] === '/') {
      if (source[position + 1] !== undefined) {
        result[position + 1] = ' ';
      }
      return position + 2;
    }
    position++;
  }
  return position;
}

function maskString(source: string, result: string[], start: number): number {
  let position = start;
  while (position < source.length) {
    if (source[position] !== '\n' && source[position] !== '\r') {
      result[position] = ' ';
    }
    if (position > start && source[position] === "'" && !isEscaped(source, position)) {
      return position + 1;
    }
    position++;
  }
  return position;
}

function isEscaped(source: string, position: number): boolean {
  let slashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === '\\'; index--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
