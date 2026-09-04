export interface ApexBodyAnalysis {
  kind: 'class' | 'interface' | 'other';
  isTest: boolean;
  testMethodNames: string[];
}

interface MemberState {
  sawAt: boolean;
  lastTokenWasAnnotation: boolean;
  annotationParenthesisDepth: number;
  isTest: boolean;
  isTestSetup: boolean;
  identifiers: string[];
}

export function analyzeApexBody(body: string): ApexBodyAnalysis {
  let index = 0;
  let braceDepth = 0;
  let classBodyDepth: number | undefined;
  let declarationKind: 'class' | 'interface' | undefined;
  let declarationIsTest = false;
  let topLevelSawAt = false;
  let methodParenthesisDepth = 0;
  const methodNames = new Set<string>();
  const member = newMemberState();

  while (index < body.length) {
    const current = body[index];
    const next = body[index + 1];

    if (current === '/' && next === '/') {
      index = skipSingleLineComment(body, index + 2);
      continue;
    }
    if (current === '/' && next === '*') {
      index = skipMultiLineComment(body, index + 2);
      continue;
    }
    if (current === "'") {
      index = skipStringLiteral(body, index + 1);
      continue;
    }

    if (isIdentifierStart(current)) {
      const token = readIdentifier(body, index);
      index = token.end;
      const lower = token.value.toLowerCase();

      if (classBodyDepth === undefined) {
        if (topLevelSawAt) {
          if (lower === 'istest') declarationIsTest = true;
          topLevelSawAt = false;
        } else if (lower === 'class' || lower === 'interface') {
          declarationKind = lower;
        }
        continue;
      }

      if (braceDepth !== classBodyDepth || methodParenthesisDepth > 0) continue;
      if (member.annotationParenthesisDepth > 0) continue;

      if (member.sawAt) {
        member.isTest ||= lower === 'istest';
        member.isTestSetup ||= lower === 'testsetup';
        member.sawAt = false;
        member.lastTokenWasAnnotation = true;
      } else {
        member.lastTokenWasAnnotation = false;
        member.identifiers.push(token.value);
      }
      continue;
    }

    index++;

    if (classBodyDepth === undefined) {
      if (current === '@') {
        topLevelSawAt = true;
      } else if (current === '{' && declarationKind !== undefined) {
        braceDepth++;
        classBodyDepth = braceDepth;
        resetMemberState(member);
      } else if (current === '{') {
        braceDepth++;
      } else if (current === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    if (current === '{') {
      braceDepth++;
      resetMemberState(member);
      methodParenthesisDepth = 0;
      continue;
    }
    if (current === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth < classBodyDepth) break;
      if (braceDepth === classBodyDepth) resetMemberState(member);
      methodParenthesisDepth = 0;
      continue;
    }
    if (braceDepth !== classBodyDepth) continue;

    if (current === '@' && methodParenthesisDepth === 0) {
      member.sawAt = true;
      member.lastTokenWasAnnotation = false;
      continue;
    }
    if (current === '(') {
      if (member.lastTokenWasAnnotation && methodParenthesisDepth === 0) {
        member.annotationParenthesisDepth = 1;
        member.lastTokenWasAnnotation = false;
        continue;
      }
      if (member.annotationParenthesisDepth > 0) {
        member.annotationParenthesisDepth++;
        continue;
      }
      if (methodParenthesisDepth === 0) {
        const methodName = member.identifiers.at(-1);
        const legacy = member.identifiers.some(
          (identifier) => identifier.toLowerCase() === 'testmethod'
        );
        if (methodName && !member.isTestSetup && (member.isTest || legacy)) {
          methodNames.add(methodName);
        }
      }
      methodParenthesisDepth++;
      continue;
    }
    if (current === ')') {
      if (member.annotationParenthesisDepth > 0) {
        member.annotationParenthesisDepth--;
      } else if (methodParenthesisDepth > 0) {
        methodParenthesisDepth--;
      }
      continue;
    }
    if (current === ';' && methodParenthesisDepth === 0) {
      resetMemberState(member);
    }
  }

  const testMethodNames = [...methodNames].sort((left, right) => left.localeCompare(right));
  return {
    kind: declarationKind ?? 'other',
    isTest: declarationKind === 'class' && (declarationIsTest || testMethodNames.length > 0),
    testMethodNames,
  };
}

function newMemberState(): MemberState {
  return {
    sawAt: false,
    lastTokenWasAnnotation: false,
    annotationParenthesisDepth: 0,
    isTest: false,
    isTestSetup: false,
    identifiers: [],
  };
}

function resetMemberState(member: MemberState): void {
  member.sawAt = false;
  member.lastTokenWasAnnotation = false;
  member.annotationParenthesisDepth = 0;
  member.isTest = false;
  member.isTestSetup = false;
  member.identifiers = [];
}

function skipSingleLineComment(body: string, index: number): number {
  while (index < body.length && body[index] !== '\n' && body[index] !== '\r') index++;
  return index;
}

function skipMultiLineComment(body: string, index: number): number {
  while (index < body.length) {
    if (body[index] === '*' && body[index + 1] === '/') return index + 2;
    index++;
  }
  return index;
}

function skipStringLiteral(body: string, index: number): number {
  while (index < body.length) {
    if (body[index] === '\\') {
      index += 2;
      continue;
    }
    if (body[index] === "'") return index + 1;
    index++;
  }
  return index;
}

function isIdentifierStart(value: string | undefined): boolean {
  if (value === undefined) return false;
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || value === '_';
}

function isIdentifierPart(value: string | undefined): boolean {
  if (value === undefined) return false;
  const code = value.charCodeAt(0);
  return (
    (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || value === '_'
  );
}

function readIdentifier(body: string, start: number): { value: string; end: number } {
  let end = start + 1;
  while (end < body.length && isIdentifierPart(body[end])) end++;
  return { value: body.slice(start, end), end };
}
