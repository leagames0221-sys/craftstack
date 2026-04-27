"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { getPusherClient } from "@/lib/pusher-client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addCard, addList } from "./actions";
import {
  applyLabelFilter,
  applyMove,
  applyTitleSearch,
  dueStatus,
  findCardLocation,
  type ClientCard,
  type ClientLabel,
  type ClientList,
} from "./dnd-helpers";
import {
  emptyHistory,
  markStale,
  popRedo,
  popUndo,
  pushMove,
  removeByCardId,
  type MoveEndpoint,
  type MoveEntry,
  type MoveHistory,
} from "./move-history";

export type { ClientCard, ClientList };

type Props = {
  slug: string;
  boardId: string;
  canWrite: boolean;
  canCurate: boolean;
  initialLists: ClientList[];
};

export function BoardClient({
  slug,
  boardId,
  canWrite,
  canCurate,
  initialLists,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [lists, setLists] = useState<ClientList[]>(initialLists);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const snapshotRef = useRef<ClientList[] | null>(null);
  const historyRef = useRef<MoveHistory>(emptyHistory());

  // Keep local state in sync with props whenever the server re-renders
  // (e.g. after revalidatePath or a Pusher-triggered refresh).
  // Using a version signature avoids resetting mid-drag.
  useSyncInitial(initialLists, setLists, activeCardId);

  // Subscribe to realtime updates for this board; on any mutation broadcast
  // by another client we ask Next.js to re-fetch server state. Our own
  // writes also echo back — they're idempotent so it's fine. Falls back to
  // a no-op when Pusher env vars aren't configured.
  //
  // ADR-0048 Rule 1: card.moved / card.deleted broadcasts mark the local
  // undo/redo stack stale before the local view updates, so Ctrl-Z
  // hitting an entry whose card was concurrently moved or deleted lands
  // on a scoped toast instead of replaying against an inconsistent
  // server state. card.updated (title/labels/assignees) is the narrow
  // exception per Rule 3 — undo is move-scoped.
  useEffect(() => {
    const client = getPusherClient();
    if (!client) return;
    const channel = client.subscribe(`board-${boardId}`);
    const refreshIfIdle = () => {
      if (!activeCardIdRef.current) router.refresh();
    };
    const onCardMoved = (data: { cardId?: string } | undefined) => {
      if (data?.cardId) {
        historyRef.current = markStale(
          historyRef.current,
          data.cardId,
          "concurrent-move",
        );
      }
      refreshIfIdle();
    };
    const onCardDeleted = (data: { cardId?: string } | undefined) => {
      if (data?.cardId) {
        const had =
          historyRef.current.undo.some((e) => e.cardId === data.cardId) ||
          historyRef.current.redo.some((e) => e.cardId === data.cardId);
        historyRef.current = removeByCardId(historyRef.current, data.cardId);
        if (had) {
          setToast(
            "A card you previously moved was deleted by another user. Its undo entry has been removed.",
          );
        }
      }
      refreshIfIdle();
    };
    // card.updated → no stale-marking per ADR-0048 Rule 3 narrow
    // exception. Title / label / assignee edits don't invalidate a
    // move-undo. Just refresh.
    channel.bind("card.moved", onCardMoved);
    channel.bind("card.deleted", onCardDeleted);
    for (const evt of [
      "card.created",
      "card.updated",
      "list.created",
      "list.updated",
      "list.deleted",
    ]) {
      channel.bind(evt, refreshIfIdle);
    }
    return () => {
      channel.unbind_all();
      client.unsubscribe(`board-${boardId}`);
    };
  }, [boardId, router]);

  const activeCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeCardIdRef.current = activeCardId;
  }, [activeCardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const activeCard = useMemo(() => {
    if (!activeCardId) return null;
    for (const l of lists) {
      const c = l.cards.find((c) => c.id === activeCardId);
      if (c) return c;
    }
    return null;
  }, [activeCardId, lists]);

  // URL-driven label filter: `?labels=id1,id2`. Using the URL as the source
  // of truth makes filters shareable and survives refreshes.
  const activeLabelIds = useMemo(() => {
    const raw = searchParams.get("labels") ?? "";
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const availableLabels = useMemo(() => {
    const byId = new Map<string, ClientLabel>();
    for (const l of lists) {
      for (const c of l.cards) {
        for (const lb of c.labels) if (!byId.has(lb.id)) byId.set(lb.id, lb);
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [lists]);

  const query = searchParams.get("q") ?? "";

  const visibleLists = useMemo(
    () => applyTitleSearch(applyLabelFilter(lists, activeLabelIds), query),
    [lists, activeLabelIds, query],
  );

  const setQuery = useCallback(
    (next: string) => {
      const qs = new URLSearchParams(searchParams.toString());
      if (next.trim()) qs.set("q", next);
      else qs.delete("q");
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleLabelFilter = useCallback(
    (labelId: string) => {
      const next = new Set(activeLabelIds);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      const qs = new URLSearchParams(searchParams.toString());
      if (next.size === 0) qs.delete("labels");
      else qs.set("labels", [...next].join(","));
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [activeLabelIds, pathname, router, searchParams],
  );

  const clearLabelFilter = useCallback(() => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("labels");
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      if (!canWrite) return;
      snapshotRef.current = lists;
      setActiveCardId(String(e.active.id));
    },
    [canWrite, lists],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveCardId(null);
      if (!canWrite) return;

      const { active, over } = e;
      if (!over) return;
      const cardId = String(active.id);
      const overId = String(over.id);

      const sourceIdx = findCardLocation(lists, cardId);
      if (!sourceIdx) return;

      // `over` can be either a card id or a list droppable id (`list:<id>`).
      let destListId: string;
      let destIndex: number;
      if (overId.startsWith("list:")) {
        destListId = overId.slice("list:".length);
        const destList = lists.find((l) => l.id === destListId);
        if (!destList) return;
        // Dropping onto the empty list area => append to end.
        destIndex = destList.cards.filter((c) => c.id !== cardId).length;
      } else {
        const dest = findCardLocation(lists, overId);
        if (!dest) return;
        destListId = dest.listId;
        const destList = lists.find((l) => l.id === destListId)!;
        const filtered = destList.cards.filter((c) => c.id !== cardId);
        const overIndexInFiltered = filtered.findIndex((c) => c.id === overId);
        // When dragging within the same list downward, dnd-kit reports the
        // over index as if the dragged item were still in place; inserting
        // *after* the over index gives the UX users expect.
        const draggingDown =
          sourceIdx.listId === destListId &&
          sourceIdx.index < overIndexInFiltered + 1;
        destIndex = draggingDown
          ? overIndexInFiltered + 1
          : overIndexInFiltered;
      }

      // Short-circuit no-op drops so we don't bump version for nothing.
      if (sourceIdx.listId === destListId && sourceIdx.index === destIndex) {
        return;
      }

      // Snapshot the card's original neighbors BEFORE the local state is
      // mutated by applyMove — this becomes the `from` endpoint we replay
      // during Ctrl-Z.
      const sourceList = lists.find((l) => l.id === sourceIdx.listId)!;
      const fromBeforeId = sourceList.cards[sourceIdx.index - 1]?.id ?? null;
      const fromAfterId = sourceList.cards[sourceIdx.index + 1]?.id ?? null;

      const next = applyMove(lists, cardId, destListId, destIndex);
      setLists(next);

      const destList = next.find((l) => l.id === destListId)!;
      const newIndex = destList.cards.findIndex((c) => c.id === cardId);
      const beforeId = destList.cards[newIndex - 1]?.id ?? null;
      const afterId = destList.cards[newIndex + 1]?.id ?? null;

      const movedCard = destList.cards[newIndex];
      void submitMove(
        {
          cardId,
          version: movedCard.version,
          listId: destListId,
          beforeId,
          afterId,
        },
        {
          from: {
            listId: sourceIdx.listId,
            beforeId: fromBeforeId,
            afterId: fromAfterId,
          },
          to: { listId: destListId, beforeId, afterId },
        },
      );
    },
    [canWrite, lists],
  );

  const submitMove = useCallback(
    async (
      payload: {
        cardId: string;
        version: number;
        listId: string;
        beforeId: string | null;
        afterId: string | null;
      },
      historyEntry?: { from: MoveEndpoint; to: MoveEndpoint },
    ): Promise<boolean> => {
      const snapshot = snapshotRef.current;
      try {
        const res = await fetch(`/api/cards/${payload.cardId}/move`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: payload.version,
            listId: payload.listId,
            beforeId: payload.beforeId,
            afterId: payload.afterId,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setToast("Someone else moved this card — reloading.");
          } else {
            setToast(
              (body && typeof body.message === "string" && body.message) ||
                "Move failed — reverting.",
            );
          }
          if (snapshot) setLists(snapshot);
          router.refresh();
          return false;
        }
        // Success: authoritative state will land via router.refresh(); bump
        // the local version eagerly so repeat drags don't stale-conflict.
        setLists((prev) =>
          prev.map((l) =>
            l.id !== payload.listId
              ? l
              : {
                  ...l,
                  cards: l.cards.map((c) =>
                    c.id === payload.cardId
                      ? { ...c, version: c.version + 1 }
                      : c,
                  ),
                },
          ),
        );
        if (historyEntry) {
          historyRef.current = pushMove(historyRef.current, {
            cardId: payload.cardId,
            from: historyEntry.from,
            to: historyEntry.to,
          });
        }
        router.refresh();
        return true;
      } catch {
        setToast("Network error — reverting.");
        if (snapshot) setLists(snapshot);
        return false;
      }
    },
    [router],
  );

  /**
   * Apply an endpoint (targetList + neighbors) to the current local state
   * and submit the move. Used by Ctrl-Z / Ctrl-Shift-Z replay — the
   * caller has already moved entries between the undo/redo stacks, so we
   * intentionally do NOT push history here.
   */
  const replayMove = useCallback(
    async (cardId: string, target: MoveEndpoint): Promise<boolean> => {
      const loc = findCardLocation(lists, cardId);
      if (!loc) return false;
      const card = lists
        .find((l) => l.id === loc.listId)!
        .cards.find((c) => c.id === cardId)!;

      const destList = lists.find((l) => l.id === target.listId);
      if (!destList) return false;
      const candidates = destList.cards.filter((c) => c.id !== cardId);

      // Resolve the desired insertion index against the CURRENT neighbor
      // ids. If neither neighbor is still in the list, fall back to append
      // — that's the least-surprising behavior when the surrounding cards
      // were moved or deleted in the meantime.
      let destIndex: number;
      if (target.beforeId) {
        const idx = candidates.findIndex((c) => c.id === target.beforeId);
        destIndex = idx >= 0 ? idx + 1 : candidates.length;
      } else if (target.afterId) {
        const idx = candidates.findIndex((c) => c.id === target.afterId);
        destIndex = idx >= 0 ? idx : 0;
      } else {
        destIndex = candidates.length;
      }

      snapshotRef.current = lists;
      const next = applyMove(lists, cardId, target.listId, destIndex);
      setLists(next);

      const destListNext = next.find((l) => l.id === target.listId)!;
      const newIndex = destListNext.cards.findIndex((c) => c.id === cardId);
      const beforeId = destListNext.cards[newIndex - 1]?.id ?? null;
      const afterId = destListNext.cards[newIndex + 1]?.id ?? null;

      return submitMove({
        cardId,
        version: card.version,
        listId: target.listId,
        beforeId,
        afterId,
      });
    },
    [lists, submitMove],
  );

  // ADR-0048 Rule 2: pop until a non-stale entry surfaces. Stale
  // entries are dropped silently with a single skip-count; a concrete
  // toast distinguishes "skipped because another user moved this
  // card" from "stack empty / all stale". No server round-trip on
  // stale entries — replay would just hit a 409 and fall back to the
  // generic toast.
  const undoMove = useCallback(async () => {
    let history = historyRef.current;
    let entry: MoveEntry | null = null;
    let skipped = 0;
    while (true) {
      const r = popUndo(history);
      if (!r) {
        break;
      }
      history = r.next;
      if (!r.entry.stale) {
        entry = r.entry;
        break;
      }
      skipped += 1;
    }
    historyRef.current = history;
    if (!entry) {
      setToast(
        skipped > 0
          ? "No un-modified moves to undo (concurrent edits invalidated the rest)."
          : "Nothing to undo",
      );
      return;
    }
    if (skipped > 0) {
      setToast(
        `Skipped ${skipped} undo ${skipped === 1 ? "entry" : "entries"} modified by another user; replaying the next available move.`,
      );
    }
    const ok = await replayMove(entry.cardId, entry.from);
    if (ok && skipped === 0) setToast("Move undone (⌘/Ctrl-Shift-Z to redo)");
  }, [replayMove]);

  const redoMove = useCallback(async () => {
    let history = historyRef.current;
    let entry: MoveEntry | null = null;
    let skipped = 0;
    while (true) {
      const r = popRedo(history);
      if (!r) {
        break;
      }
      history = r.next;
      if (!r.entry.stale) {
        entry = r.entry;
        break;
      }
      skipped += 1;
    }
    historyRef.current = history;
    if (!entry) {
      setToast(
        skipped > 0
          ? "No un-modified moves to redo (concurrent edits invalidated the rest)."
          : "Nothing to redo",
      );
      return;
    }
    if (skipped > 0) {
      setToast(
        `Skipped ${skipped} redo ${skipped === 1 ? "entry" : "entries"} modified by another user; replaying the next available move.`,
      );
    }
    const ok = await replayMove(entry.cardId, entry.to);
    if (ok && skipped === 0) setToast("Move redone");
  }, [replayMove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key !== "z" && e.key !== "Z") return;
      // Don't hijack Ctrl-Z while typing into an input or contenteditable.
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          t.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      if (e.shiftKey) void redoMove();
      else void undoMove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undoMove, redoMove]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SearchBar query={query} onChange={setQuery} />
        <FilterBar
          available={availableLabels}
          active={activeLabelIds}
          onToggle={toggleLabelFilter}
          onClear={clearLabelFilter}
        />
        <div className="mx-auto max-w-full px-6 pb-6 overflow-x-auto">
          <ol className="flex gap-4 items-start min-h-[70vh]">
            {visibleLists.map((l) => (
              <ListColumn
                key={l.id}
                list={l}
                slug={slug}
                boardId={boardId}
                canWrite={canWrite}
                canCurate={canCurate}
              />
            ))}
            {canWrite ? <AddListColumn slug={slug} boardId={boardId} /> : null}
            {lists.length === 0 && !canWrite ? (
              <li className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-16 text-center text-neutral-300">
                No lists yet — ask an Editor to create one.
              </li>
            ) : null}
          </ol>
        </div>
        <DragOverlay>
          {activeCard ? (
            <div className="rounded-lg bg-neutral-800 border border-indigo-500/70 shadow-2xl px-3 py-2 text-sm text-neutral-50">
              {activeCard.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 shadow-lg"
        >
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-3 text-amber-300/80 hover:text-amber-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}

function WipLimitEditor({
  listId,
  current,
}: {
  listId: string;
  current: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wipLimit: parsed }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(current?.toString() ?? "");
          setEditing(true);
        }}
        className="text-[10px] text-neutral-500 hover:text-neutral-300"
        title="Set WIP limit"
        aria-label="Set WIP limit"
      >
        ⚙
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="∞"
        className="h-5 w-12 rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px] text-neutral-100 focus:border-indigo-400 focus:outline-none"
        autoFocus
      />
      <button
        type="submit"
        disabled={busy}
        className="text-[10px] text-indigo-300 hover:text-indigo-200 disabled:text-neutral-600"
      >
        save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-[10px] text-neutral-500 hover:text-neutral-300"
      >
        ✕
      </button>
    </form>
  );
}

function SearchBar({
  query,
  onChange,
}: {
  query: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mx-auto max-w-full px-6 pt-4">
      <div className="relative max-w-md">
        <input
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search cards by title…"
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 pl-8 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label="Search cards"
        />
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
          aria-hidden
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function DueBadge({ dueIso }: { dueIso: string | null }) {
  if (!dueIso) return <span />;
  const status = dueStatus(dueIso);
  const styles: Record<string, string> = {
    overdue: "border-red-500/40 bg-red-500/15 text-red-200",
    today: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    soon: "border-amber-500/20 bg-amber-500/5 text-amber-200",
    later: "border-neutral-700 bg-neutral-800/60 text-neutral-400",
    none: "",
  };
  const label =
    status === "overdue" ? "overdue" : status === "today" ? "today" : "due";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${styles[status]}`}
      title={`Due ${dueIso.slice(0, 10)}`}
    >
      {label} {dueIso.slice(5, 10)}
    </span>
  );
}

function FilterBar({
  available,
  active,
  onToggle,
  onClear,
}: {
  available: ClientLabel[];
  active: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  if (available.length === 0) return null;
  const activeSet = new Set(active);
  return (
    <div className="mx-auto max-w-full px-6 pt-4 pb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 mr-1">
        Filter by label
      </span>
      {available.map((l) => {
        const on = activeSet.has(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onToggle(l.id)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
              on
                ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: l.color }}
            />
            {l.name}
          </button>
        );
      })}
      {active.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-[11px] text-neutral-400 hover:text-neutral-200"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function ListColumn({
  list,
  slug,
  boardId,
  canWrite,
  canCurate,
}: {
  list: ClientList;
  slug: string;
  boardId: string;
  canWrite: boolean;
  canCurate: boolean;
}) {
  const cardIds = list.cards.map((c) => c.id);
  const overLimit = list.wipLimit !== null && list.cards.length > list.wipLimit;
  const atLimit = list.wipLimit !== null && list.cards.length === list.wipLimit;
  return (
    <li
      className={`min-w-[300px] max-w-[300px] rounded-2xl bg-neutral-900 border p-3 flex flex-col transition ${
        overLimit
          ? "border-red-500/50 ring-1 ring-red-500/30"
          : atLimit
            ? "border-amber-500/40"
            : "border-neutral-800"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{list.title}</h3>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] ${
              overLimit
                ? "text-red-300 font-medium"
                : atLimit
                  ? "text-amber-300"
                  : "text-neutral-500"
            }`}
            title={
              overLimit
                ? `Over WIP limit (${list.cards.length} of ${list.wipLimit})`
                : undefined
            }
          >
            {list.cards.length}
            {list.wipLimit ? `/${list.wipLimit}` : ""}
          </span>
          {canCurate ? (
            <WipLimitEditor listId={list.id} current={list.wipLimit} />
          ) : null}
        </div>
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <ListDroppable listId={list.id}>
          <ul className="space-y-2 flex-1 min-h-[40px]">
            {list.cards.map((c) => (
              <SortableCard
                key={c.id}
                card={c}
                slug={slug}
                boardId={boardId}
                draggable={canWrite}
              />
            ))}
            {list.cards.length === 0 ? (
              <li className="px-3 py-2 text-xs text-neutral-500">
                No cards yet.
              </li>
            ) : null}
          </ul>
        </ListDroppable>
      </SortableContext>

      {canWrite ? (
        <form
          action={async (fd) => {
            await addCard(slug, boardId, list.id, fd);
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            type="text"
            name="title"
            required
            maxLength={200}
            placeholder="+ Add card"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 transition"
          >
            Add
          </button>
        </form>
      ) : null}
    </li>
  );
}

function ListDroppable({
  listId,
  children,
}: {
  listId: string;
  children: React.ReactNode;
}) {
  // Uses a sortable node at the list level so empty lists still register as a
  // drop target. The id is namespaced with `list:` so onDragEnd can tell
  // them apart from card ids.
  const { setNodeRef } = useSortable({ id: `list:${listId}` });
  return <div ref={setNodeRef}>{children}</div>;
}

function SortableCard({
  card,
  slug,
  boardId,
  draggable,
}: {
  card: ClientCard;
  slug: string;
  boardId: string;
  draggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } as const;

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link
        href={`/w/${slug}/b/${boardId}?card=${card.id}`}
        className="block rounded-lg bg-neutral-800/60 border border-neutral-700/70 px-3 py-2 text-sm hover:bg-neutral-800 hover:border-neutral-600 transition"
        // Suppress navigation when the user is finishing a drag gesture.
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        {card.labels.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {card.labels.map((l) => (
              <span
                key={l.id}
                title={l.name}
                className="inline-block h-1.5 w-8 rounded-full"
                style={{ backgroundColor: l.color }}
              />
            ))}
          </div>
        ) : null}
        <div className="font-medium">{card.title}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <DueBadge dueIso={card.dueDate} />
          {card.assignees.length > 0 ? (
            <div className="flex -space-x-1.5">
              {card.assignees.slice(0, 3).map((a) => (
                <span
                  key={a.userId}
                  title={a.name ?? a.email}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-900 bg-neutral-700 text-[9px] font-medium text-neutral-100"
                >
                  {(a.name ?? a.email).charAt(0).toUpperCase()}
                </span>
              ))}
              {card.assignees.length > 3 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-neutral-900 bg-neutral-800 px-1 text-[9px] text-neutral-300">
                  +{card.assignees.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function AddListColumn({ slug, boardId }: { slug: string; boardId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="min-w-[300px] max-w-[300px] rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-3">
      <form
        action={(fd) => {
          startTransition(async () => {
            await addList(slug, boardId, fd);
          });
        }}
        className="flex flex-col gap-2"
      >
        <label
          htmlFor="new-list-title"
          className="text-xs font-medium text-neutral-400"
        >
          Add a list
        </label>
        <input
          id="new-list-title"
          type="text"
          name="title"
          required
          maxLength={120}
          placeholder="List title"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 transition disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create list"}
        </button>
      </form>
    </li>
  );
}

// Re-sync from server when the identity signature changes (new cards added,
// server-driven refresh), but not mid-drag.
function useSyncInitial(
  initial: ClientList[],
  setLists: (v: ClientList[]) => void,
  activeCardId: string | null,
) {
  const sig = useMemo(
    () =>
      initial
        .map(
          (l) =>
            `${l.id}:${l.cards.map((c) => `${c.id}@${c.version}`).join(",")}`,
        )
        .join("|"),
    [initial],
  );
  const lastSig = useRef(sig);
  if (sig !== lastSig.current && !activeCardId) {
    lastSig.current = sig;
    setLists(initial);
  }
}
