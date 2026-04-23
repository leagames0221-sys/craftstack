"use client";

import { useEffect, useState } from "react";

type Shortcut = {
  keys: string[];
  description: string;
};

type Group = {
  title: string;
  shortcuts: Shortcut[];
};

const GROUPS: Group[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], description: "Open this shortcut reference" },
      { keys: ["⌘/Ctrl", "K"], description: "Open the command palette" },
      { keys: ["/"], description: "Open the palette (when not typing)" },
      { keys: ["Esc"], description: "Close palette, modal, or menu" },
    ],
  },
  {
    title: "Command palette",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate results" },
      { keys: ["↵"], description: "Open the focused item" },
      { keys: [">"], description: "Switch to action mode" },
    ],
  },
];

/**
 * Small "? = help" popover listing the keyboard shortcuts the app supports.
 * Mounted once per authenticated page (dashboard / workspace / board) so
 * it's always available — no prop plumbing. Pressing "?" anywhere that
 * isn't a form field toggles the modal open.
 */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "?") return;
      // Don't hijack "?" while the user is typing into an input.
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
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Keyboard shortcuts (press ?)"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/60 text-xs font-mono text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 transition"
        title="Keyboard shortcuts (press ?)"
      >
        ?
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal
          aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_10px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                Keyboard shortcuts
              </h2>
              <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                ESC
              </span>
            </div>

            <div className="mt-5 space-y-5">
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <h3 className="mb-2 text-[10px] uppercase tracking-widest text-neutral-500">
                    {g.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {g.shortcuts.map((s) => (
                      <li
                        key={s.description}
                        className="flex items-center justify-between gap-4 text-sm text-neutral-200"
                      >
                        <span>{s.description}</span>
                        <span className="flex gap-1">
                          {s.keys.map((k, i) => (
                            <kbd
                              key={`${s.description}-${i}`}
                              className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
