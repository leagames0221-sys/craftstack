export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
};

/**
 * Static action catalogue surfaced when the user types ">" in the palette,
 * Linear-style. Kept as a plain array so the filter is a pure function and
 * easy to unit test. Mutations to this list should preserve insertion order
 * — the palette shows them in the order declared here when no query is typed.
 */
export const PALETTE_ACTIONS: PaletteAction[] = [
  {
    id: "workspace.new",
    label: "New workspace",
    hint: "Create a brand-new workspace",
    keywords: ["create", "add", "workspace"],
  },
  {
    id: "board.new",
    label: "New board (in current workspace)",
    hint: "Only works while viewing a workspace or board",
    keywords: ["create", "add", "board"],
  },
  {
    id: "auth.signout",
    label: "Sign out",
    hint: "End the current session",
    keywords: ["logout", "signout", "exit"],
  },
];

/**
 * Case-insensitive substring filter that also matches against the action
 * `keywords` list. Pure so we can test a bunch of combinations without having
 * to mount the palette.
 */
export function filterActions(
  actions: PaletteAction[],
  query: string,
): PaletteAction[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return actions;
  return actions.filter((a) => {
    if (a.label.toLowerCase().includes(q)) return true;
    if (a.hint && a.hint.toLowerCase().includes(q)) return true;
    if (a.keywords && a.keywords.some((k) => k.toLowerCase().includes(q))) {
      return true;
    }
    return false;
  });
}

/**
 * Detect the ">" prefix that signals "show me actions". Returns the raw query
 * with the ">" stripped, or null when the input is a normal search.
 */
export function extractActionQuery(input: string): string | null {
  if (!input.startsWith(">")) return null;
  return input.slice(1).trimStart();
}
