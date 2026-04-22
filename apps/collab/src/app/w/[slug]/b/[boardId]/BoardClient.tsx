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
  findCardLocation,
  type ClientCard,
  type ClientLabel,
  type ClientList,
} from "./dnd-helpers";

export type { ClientCard, ClientList };

type Props = {
  slug: string;
  boardId: string;
  canWrite: boolean;
  initialLists: ClientList[];
};

export function BoardClient({ slug, boardId, canWrite, initialLists }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [lists, setLists] = useState<ClientList[]>(initialLists);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const snapshotRef = useRef<ClientList[] | null>(null);

  // Keep local state in sync with props whenever the server re-renders
  // (e.g. after revalidatePath or a Pusher-triggered refresh).
  // Using a version signature avoids resetting mid-drag.
  useSyncInitial(initialLists, setLists, activeCardId);

  // Subscribe to realtime updates for this board; on any mutation broadcast
  // by another client we ask Next.js to re-fetch server state. Our own
  // writes also echo back — they're idempotent so it's fine. Falls back to
  // a no-op when Pusher env vars aren't configured.
  useEffect(() => {
    const client = getPusherClient();
    if (!client) return;
    const channel = client.subscribe(`board-${boardId}`);
    const handler = () => {
      if (!activeCardIdRef.current) router.refresh();
    };
    for (const evt of [
      "card.created",
      "card.updated",
      "card.moved",
      "card.deleted",
      "list.created",
      "list.updated",
      "list.deleted",
    ]) {
      channel.bind(evt, handler);
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

  const visibleLists = useMemo(
    () => applyLabelFilter(lists, activeLabelIds),
    [lists, activeLabelIds],
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

      const next = applyMove(lists, cardId, destListId, destIndex);
      setLists(next);

      const destList = next.find((l) => l.id === destListId)!;
      const newIndex = destList.cards.findIndex((c) => c.id === cardId);
      const beforeId = destList.cards[newIndex - 1]?.id ?? null;
      const afterId = destList.cards[newIndex + 1]?.id ?? null;

      const movedCard = destList.cards[newIndex];
      void submitMove({
        cardId,
        version: movedCard.version,
        listId: destListId,
        beforeId,
        afterId,
      });
    },
    [canWrite, lists],
  );

  const submitMove = useCallback(
    async (payload: {
      cardId: string;
      version: number;
      listId: string;
      beforeId: string | null;
      afterId: string | null;
    }) => {
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
          return;
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
        router.refresh();
      } catch {
        setToast("Network error — reverting.");
        if (snapshot) setLists(snapshot);
      }
    },
    [router],
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
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
}: {
  list: ClientList;
  slug: string;
  boardId: string;
  canWrite: boolean;
}) {
  const cardIds = list.cards.map((c) => c.id);
  return (
    <li className="min-w-[300px] max-w-[300px] rounded-2xl bg-neutral-900 border border-neutral-800 p-3 flex flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{list.title}</h3>
        <span className="text-[10px] text-neutral-500">
          {list.cards.length}
          {list.wipLimit ? `/${list.wipLimit}` : ""}
        </span>
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
          {card.dueDate ? (
            <span className="text-[10px] text-neutral-500">
              due {card.dueDate.slice(0, 10)}
            </span>
          ) : (
            <span />
          )}
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
