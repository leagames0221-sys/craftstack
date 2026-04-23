"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PALETTE_ACTIONS,
  extractActionQuery,
  filterActions,
  type PaletteAction,
} from "@/lib/palette-commands";
import type {
  SearchBoardHit,
  SearchCardHit,
  SearchResult,
  SearchWorkspaceHit,
} from "@/server/search";

type PaletteContext = {
  workspaceSlug?: string;
  boardId?: string;
};

const DEBOUNCE_MS = 150;
const EMPTY: SearchResult = { workspaces: [], boards: [], cards: [] };

/**
 * Global ⌘K / Ctrl-K command palette. Mounted once per page via its header
 * trigger — opening is handled by this component through keyboard listener,
 * so there is no "isOpen" prop to plumb from parent. Closed state is free.
 *
 * Inputs starting with ">" switch to the static action list (see
 * PALETTE_ACTIONS). Everything else is sent to /api/search and rendered in
 * three groups: workspaces / boards / cards.
 */
export function CommandPalette({ ctx = {} }: { ctx?: PaletteContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" opens the palette (Slack / GitHub convention), but only when
      // the user isn't already typing into a form field.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const tag = t.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  const actionMode = extractActionQuery(input) !== null;

  useEffect(() => {
    if (!open) return;
    if (actionMode) return;

    const stamp = Date.now();
    lastFetchRef.current = stamp;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(input.trim())}`,
        );
        if (stamp !== lastFetchRef.current) return;
        if (!res.ok) {
          setResults(EMPTY);
          return;
        }
        const body = (await res.json()) as SearchResult;
        if (stamp !== lastFetchRef.current) return;
        setResults(body);
      } catch {
        if (stamp === lastFetchRef.current) setResults(EMPTY);
      } finally {
        if (stamp === lastFetchRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [input, open, actionMode]);

  const runAction = useCallback(
    (action: PaletteAction) => {
      setOpen(false);
      switch (action.id) {
        case "workspace.new":
          router.push("/workspaces/new");
          return;
        case "board.new":
          if (ctx.workspaceSlug) {
            router.push(`/w/${ctx.workspaceSlug}/boards/new`);
          } else {
            router.push("/dashboard");
          }
          return;
        case "auth.signout":
          void signOut({ callbackUrl: "/" });
          return;
      }
    },
    [ctx.workspaceSlug, router],
  );

  const goWorkspace = useCallback(
    (w: SearchWorkspaceHit) => {
      setOpen(false);
      router.push(`/w/${w.slug}`);
    },
    [router],
  );

  const goBoard = useCallback(
    (b: SearchBoardHit) => {
      setOpen(false);
      router.push(`/w/${b.workspaceSlug}/b/${b.id}`);
    },
    [router],
  );

  const openCard = useCallback(
    (c: SearchCardHit) => {
      setOpen(false);
      router.push(
        `/w/${c.workspaceSlug}/b/${c.boardId}?card=${encodeURIComponent(c.id)}`,
      );
    },
    [router],
  );

  const filteredActions = useMemo(() => {
    const sub = extractActionQuery(input);
    return sub === null ? [] : filterActions(PALETTE_ACTIONS, sub);
  }, [input]);

  return (
    <>
      <button
        type="button"
        aria-label="Open command palette"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-xs text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 transition"
      >
        <SearchGlyph />
        <span className="hidden sm:inline">Search</span>
        <span
          aria-hidden
          className="hidden sm:inline rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
        >
          ⌘K
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal
          aria-label="Command palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <Command
            label="Command Palette"
            shouldFilter={false}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-neutral-950/85 shadow-[0_10px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <SearchGlyph />
              <Command.Input
                autoFocus
                value={input}
                onValueChange={setInput}
                placeholder="Search or type > for actions"
                className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
              />
              <span
                aria-hidden
                className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
              >
                ESC
              </span>
            </div>

            <Command.List className="max-h-[55vh] overflow-y-auto px-2 py-2">
              <Command.Empty className="px-3 py-6 text-center text-xs text-neutral-500">
                {loading ? "Searching…" : "No matches."}
              </Command.Empty>

              {actionMode ? (
                <Command.Group
                  heading="Actions"
                  className="text-[10px] uppercase tracking-wider text-neutral-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                >
                  {filteredActions.map((a) => (
                    <Command.Item
                      key={a.id}
                      value={`action:${a.id}:${a.label}`}
                      onSelect={() => runAction(a)}
                      className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-200 aria-selected:bg-indigo-500/20 aria-selected:text-indigo-100"
                    >
                      <span>{a.label}</span>
                      {a.hint ? (
                        <span className="text-[10px] text-neutral-500">
                          {a.hint}
                        </span>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : (
                <>
                  {results.workspaces.length > 0 ? (
                    <Command.Group
                      heading="Workspaces"
                      className="text-[10px] uppercase tracking-wider text-neutral-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {results.workspaces.map((w) => (
                        <Command.Item
                          key={`ws:${w.id}`}
                          value={`ws:${w.id}:${w.name}`}
                          onSelect={() => goWorkspace(w)}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-200 aria-selected:bg-indigo-500/20 aria-selected:text-indigo-100"
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: w.color }}
                          />
                          <span className="flex-1">{w.name}</span>
                          <span className="text-[10px] text-neutral-500">
                            /{w.slug}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}

                  {results.boards.length > 0 ? (
                    <Command.Group
                      heading="Boards"
                      className="text-[10px] uppercase tracking-wider text-neutral-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {results.boards.map((b) => (
                        <Command.Item
                          key={`b:${b.id}`}
                          value={`b:${b.id}:${b.title}:${b.workspaceName}`}
                          onSelect={() => goBoard(b)}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-200 aria-selected:bg-indigo-500/20 aria-selected:text-indigo-100"
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{
                              background: b.color ?? "rgba(255,255,255,0.3)",
                            }}
                          />
                          <span className="flex-1">{b.title}</span>
                          <span className="text-[10px] text-neutral-500">
                            {b.workspaceName}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}

                  {results.cards.length > 0 ? (
                    <Command.Group
                      heading="Cards"
                      className="text-[10px] uppercase tracking-wider text-neutral-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {results.cards.map((c) => (
                        <Command.Item
                          key={`c:${c.id}`}
                          value={`c:${c.id}:${c.title}:${c.boardTitle}`}
                          onSelect={() => openCard(c)}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-200 aria-selected:bg-indigo-500/20 aria-selected:text-indigo-100"
                        >
                          <CardGlyph />
                          <span className="flex-1 truncate">{c.title}</span>
                          <span className="truncate text-[10px] text-neutral-500">
                            {c.boardTitle} · {c.workspaceName}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              )}
            </Command.List>

            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-neutral-500">
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate · <Kbd>↵</Kbd> open
              </span>
              <span>
                <Kbd>&gt;</Kbd> for actions
              </span>
            </div>
          </Command>
        </div>
      ) : null}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 font-mono text-neutral-400">
      {children}
    </span>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CardGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}
