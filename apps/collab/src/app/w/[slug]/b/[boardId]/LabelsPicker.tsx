"use client";

import { useEffect, useState } from "react";

type Label = { id: string; name: string; color: string };

type Props = {
  cardId: string;
  workspaceId: string;
  initialSelected: Label[];
  canEdit: boolean;
  canCurate: boolean;
};

const PALETTE = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#64748B",
];

export function LabelsPicker({
  cardId,
  workspaceId,
  initialSelected,
  canEdit,
  canCurate,
}: Props) {
  const [available, setAvailable] = useState<Label[] | null>(null);
  const [selected, setSelected] = useState<Label[]>(initialSelected);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || available !== null) return;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/labels`);
        if (!res.ok) {
          setError("Could not load labels.");
          return;
        }
        setAvailable(await res.json());
      } catch {
        setError("Network error loading labels.");
      }
    })();
  }, [open, available, workspaceId]);

  const toggle = async (label: Label) => {
    if (!canEdit || busy) return;
    const isOn = selected.some((s) => s.id === label.id);
    const next = isOn
      ? selected.filter((s) => s.id !== label.id)
      : [...selected, label];
    const snapshot = selected;
    setSelected(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/labels`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labelIds: next.map((l) => l.id) }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(
          (payload && typeof payload.message === "string" && payload.message) ||
            "Could not update labels.",
        );
        setSelected(snapshot);
      }
    } finally {
      setBusy(false);
    }
  };

  const createLabel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/labels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (payload && typeof payload.message === "string" && payload.message) ||
            "Could not create label.",
        );
        return;
      }
      const label = payload as Label;
      setAvailable((prev) => [...(prev ?? []), label]);
      setNewName("");
      await toggle(label);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-4 border-t border-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Labels
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {selected.length === 0 ? (
              <span className="text-xs text-neutral-500">None</span>
            ) : (
              selected.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-100"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.name}
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
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 space-y-3">
          {available === null ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : available.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No labels yet.{" "}
              {canCurate ? "Create one below." : "Ask an admin to create some."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {available.map((l) => {
                const on = selected.some((s) => s.id === l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => void toggle(l)}
                      disabled={busy}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
                        on
                          ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                          : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      {l.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {canCurate ? (
            <form onSubmit={createLabel} className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                placeholder="New label name"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div className="flex items-center gap-1">
                {PALETTE.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setNewColor(c)}
                    aria-label={`Color ${c}`}
                    className={`h-4 w-4 rounded-full border transition ${
                      c === newColor ? "border-white" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-md bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400 transition disabled:opacity-60"
              >
                Add
              </button>
            </form>
          ) : null}

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
