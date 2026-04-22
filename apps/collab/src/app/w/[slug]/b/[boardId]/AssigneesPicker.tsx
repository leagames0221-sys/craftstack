"use client";

import { useEffect, useState } from "react";

type Member = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
};

type Props = {
  cardId: string;
  workspaceId: string;
  initialSelected: Member[];
  canEdit: boolean;
};

export function AssigneesPicker({
  cardId,
  workspaceId,
  initialSelected,
  canEdit,
}: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [selected, setSelected] = useState<Member[]>(initialSelected);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || members !== null) return;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/members`);
        if (!res.ok) {
          setError("Could not load members.");
          return;
        }
        setMembers(await res.json());
      } catch {
        setError("Network error loading members.");
      }
    })();
  }, [open, members, workspaceId]);

  const toggle = async (m: Member) => {
    if (!canEdit || busy) return;
    const isOn = selected.some((s) => s.userId === m.userId);
    const next = isOn
      ? selected.filter((s) => s.userId !== m.userId)
      : [...selected, m];
    const snapshot = selected;
    setSelected(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/assignees`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: next.map((s) => s.userId) }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(
          (payload && typeof payload.message === "string" && payload.message) ||
            "Could not update assignees.",
        );
        setSelected(snapshot);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-4 border-t border-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Assignees
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {selected.length === 0 ? (
              <span className="text-xs text-neutral-500">Unassigned</span>
            ) : (
              selected.map((a) => (
                <span
                  key={a.userId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-100"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[9px] font-medium">
                    {(a.name ?? a.email).charAt(0).toUpperCase()}
                  </span>
                  {a.name ?? a.email}
                </span>
              ))
            )}
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition"
          >
            {open ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 space-y-2">
          {members === null ? (
            <p className="text-xs text-neutral-500">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-neutral-500">No members yet.</p>
          ) : (
            <ul className="space-y-1">
              {members.map((m) => {
                const on = selected.some((s) => s.userId === m.userId);
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={() => void toggle(m)}
                      disabled={busy}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${
                        on
                          ? "bg-indigo-500/20 text-indigo-100"
                          : "text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-medium text-neutral-100">
                          {(m.name ?? m.email).charAt(0).toUpperCase()}
                        </span>
                        <span>{m.name ?? m.email}</span>
                      </span>
                      {on ? <span aria-hidden>✓</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
