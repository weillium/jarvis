export interface CleanTextResult {
  text: string;
  removedFragments: string[];
}

const SECTION_TERMINATORS: RegExp[] = [
  /\n\s*Metadata\s*\n/i,
  /#{2,}\s*discover more from/i,
  /#{2,}\s*create new account/i,
  /#{2,}\s*retrieve your password/i,
  /#{2,}\s*add new playlist/i,
  /are you sure want to unlock this post\?/i,
  /are you sure want to cancel subscription\?/i,
  /\bsubscribe now to keep reading\b/i,
  /\bcontinue reading\b/i,
  /©\s*\d{4}/i,
];

const LINE_REMOVE_PATTERNS: RegExp[] = [
  /^\s*\[?sign in with google\]?\s*$/i,
  /^\s*\[?sign up with google\]?\s*$/i,
  /^\s*\[?login\]?\s*$/i,
  /^\s*\[?sign up\]?\s*$/i,
  /^\s*remember me\s*$/i,
  /^\s*\[?forgotten password\]?\s*$/i,
  /^\s*-?\s*select visibility\s*$/i,
  /^\s*no result\s*$/i,
  /^\s*type your email.*$/i,
  /^\s*unlock left.*$/i,
  /^\s*continue reading\s*$/i,
  /^\s*subscribe now to keep reading\s*$/i,
  /^\s*cart\s*$/i,
];

const INLINE_LINK_LOGIN_PATTERN =
  /\[[^\]]+\]\((?:https?:\/\/)?[^\)]*(?:accounts\.google\.com|login|signin|register|jeg_)[^\)]*\)/gi;

const MULTIPLE_SPACES = /\s{2,}/g;

const collapseBlankLines = (lines: string[]): string[] => {
  const result: string[] = [];
  let previousBlank = false;

  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      if (!previousBlank) {
        result.push('');
        previousBlank = true;
      }
      continue;
    }
    previousBlank = false;
    result.push(line);
  }

  return result;
};

export const cleanResearchText = (input: string): CleanTextResult => {
  if (!input) {
    return { text: '', removedFragments: [] };
  }

  let working = input.replace(/\r\n/g, '\n');
  const removedFragments: string[] = [];

  for (const pattern of SECTION_TERMINATORS) {
    const match = pattern.exec(working);
    if (match && match.index > 0) {
      removedFragments.push(working.slice(match.index).trim());
      working = working.slice(0, match.index);
      break;
    }
  }

  const filteredLines: string[] = [];
  const lines = working.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      filteredLines.push('');
      continue;
    }

    if (LINE_REMOVE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      removedFragments.push(trimmed);
      continue;
    }

    const withoutLoginLinks = trimmed.replace(INLINE_LINK_LOGIN_PATTERN, '').trim();
    if (!withoutLoginLinks) {
      removedFragments.push(trimmed);
      continue;
    }

    filteredLines.push(withoutLoginLinks);
  }

  const collapsed = collapseBlankLines(filteredLines);
  let cleaned = collapsed.join('\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(MULTIPLE_SPACES, ' ');
  cleaned = cleaned.replace(/\n\s+/g, '\n');
  cleaned = cleaned.trim();

  return {
    text: cleaned,
    removedFragments,
  };
};

