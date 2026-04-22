/**
 * Extract @mentions from a comment body.
 * Matches `@` followed by 2+ word/dot/hyphen characters. Emails are tricky to
 * safely treat as mentions (they contain `@` in the middle), so we accept the
 * handle portion only — `@alice`, `@alice.brown`, `@bob-smith`. The caller
 * resolves handles to user ids by looking up by email prefix or display name.
 */
export function extractMentionHandles(body: string): string[] {
  const handles = new Set<string>();
  const rx = /(^|\s)@([A-Za-z0-9][A-Za-z0-9._-]{1,63})/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body)) !== null) {
    handles.add(m[2].toLowerCase());
  }
  return [...handles];
}
