export type ApexClassKind = true | false | undefined;

export function detectApexClassKind(body: string): ApexClassKind {
  let position = 0;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let tokenChars: string[] = [];

  while (position < body.length) {
    const character = body[position];
    const nextCharacter = body[position + 1];

    if (!inMultiLineComment && !inSingleLineComment && character === '/' && nextCharacter === '/') {
      inSingleLineComment = true;
      position += 2;
      continue;
    }

    if (!inMultiLineComment && !inSingleLineComment && character === '/' && nextCharacter === '*') {
      inMultiLineComment = true;
      position += 2;
      continue;
    }

    if (inSingleLineComment && (character === '\n' || character === '\r')) {
      inSingleLineComment = false;
      position++;
      continue;
    }

    if (inMultiLineComment && character === '*' && nextCharacter === '/') {
      inMultiLineComment = false;
      position += 2;
      continue;
    }

    if (!inSingleLineComment && !inMultiLineComment) {
      if (isTokenCharacter(character)) {
        tokenChars.push(character);
      } else if (tokenChars.length > 0) {
        const classKind = classifyToken(tokenChars.join(''));
        if (classKind !== null) {
          return classKind;
        }
        tokenChars = [];
      }
    }

    position++;
  }

  if (tokenChars.length === 0) {
    return false;
  }

  const classKind = classifyToken(tokenChars.join(''));
  return classKind === null ? false : classKind;
}

function isTokenCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || character === '@'
    || character === '_'
  );
}

function classifyToken(token: string): ApexClassKind | null {
  switch (token.toLowerCase()) {
    case '@istest':
      return true;
    case 'class':
      return false;
    case 'interface':
      return undefined;
    default:
      return null;
  }
}
