import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { removeCard, saveCard } from "./actions";
import { BoardClient, type ClientList } from "./BoardClient";
import { CommentsPanel } from "./CommentsPanel";
import { LabelsPicker } from "./LabelsPicker";
import { AssigneesPicker } from "./AssigneesPicker";
import { NotificationsBell } from "@/components/NotificationsBell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; boardId: string }>;
}) {
  const { boardId } = await params;
  const b = await prisma.board.findUnique({
    where: { id: boardId },
    select: { title: true },
  });
  return { title: `${b?.title ?? "Board"} · Boardly` };
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; boardId: string }>;
  searchParams: Promise<{ card?: string; error?: string }>;
}) {
  const session = await auth();
  const { slug, boardId } = await params;
  const { card: cardParam, error: errorParam } = await searchParams;
  if (!session?.user) {
    redirect(`/signin?callbackUrl=/w/${slug}/b/${boardId}`);
  }

  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      deletedAt: null,
      workspace: {
        slug,
        deletedAt: null,
        memberships: { some: { userId: session.user.id } },
      },
    },
    include: {
      workspace: {
        include: {
          memberships: {
            where: { userId: session.user.id },
            select: { role: true },
          },
        },
      },
      lists: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              dueDate: true,
              version: true,
              cardLabels: {
                select: {
                  label: {
                    select: { id: true, name: true, color: true },
                  },
                },
              },
              assignees: {
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!board) notFound();

  const role = board.workspace.memberships[0]?.role ?? "VIEWER";
  const canWrite = role === "OWNER" || role === "ADMIN" || role === "EDITOR";

  const initialLists: ClientList[] = board.lists.map((l) => ({
    id: l.id,
    title: l.title,
    wipLimit: l.wipLimit ?? null,
    cards: l.cards.map((c) => ({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      version: c.version,
      labels: c.cardLabels.map((cl) => ({
        id: cl.label.id,
        name: cl.label.name,
        color: cl.label.color,
      })),
      assignees: c.assignees.map((a) => ({
        userId: a.user.id,
        name: a.user.name,
        email: a.user.email,
        image: a.user.image,
      })),
    })),
  }));

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header
        className="border-b border-neutral-800"
        style={{
          background: `linear-gradient(to right, ${board.color}22, transparent)`,
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/w/${slug}`}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← {slug}
            </Link>
            <span className="text-neutral-600">/</span>
            <h1 className="text-lg font-semibold tracking-tight">
              {board.title}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>
              {board.lists.length} list{board.lists.length === 1 ? "" : "s"} ·
              role {role}
            </span>
            <NotificationsBell />
          </div>
        </div>
      </header>

      <BoardClient
        slug={slug}
        boardId={boardId}
        canWrite={canWrite}
        initialLists={initialLists}
      />

      {cardParam ? (
        <CardModal
          slug={slug}
          boardId={boardId}
          cardId={cardParam}
          error={errorParam ?? null}
          canWrite={canWrite}
          currentUserId={session.user.id}
          canModerate={role === "OWNER" || role === "ADMIN"}
        />
      ) : null}
    </main>
  );
}

async function CardModal({
  slug,
  boardId,
  cardId,
  error,
  canWrite,
  currentUserId,
  canModerate,
}: {
  slug: string;
  boardId: string;
  cardId: string;
  error: string | null;
  canWrite: boolean;
  currentUserId: string;
  canModerate: boolean;
}) {
  const card = await prisma.card.findFirst({
    where: {
      id: cardId,
      list: {
        board: {
          id: boardId,
          deletedAt: null,
          workspace: {
            slug,
            deletedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      version: true,
      list: {
        select: {
          title: true,
          board: { select: { workspaceId: true } },
        },
      },
      cardLabels: {
        select: {
          label: { select: { id: true, name: true, color: true } },
        },
      },
      assignees: {
        select: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  });

  if (!card) {
    return (
      <Overlay backHref={`/w/${slug}/b/${boardId}`}>
        <div className="px-6 py-8 text-center text-sm text-neutral-400">
          Card not found (it may have been deleted).{" "}
          <Link
            href={`/w/${slug}/b/${boardId}`}
            className="underline text-neutral-200"
          >
            Close
          </Link>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay backHref={`/w/${slug}/b/${boardId}`}>
      <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">
            in {card.list.title}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-100">
            Card detail
          </h2>
        </div>
        <Link
          href={`/w/${slug}/b/${boardId}`}
          aria-label="Close card"
          className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition"
        >
          Close
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      <form
        action={async (fd) => {
          "use server";
          await saveCard(slug, boardId, cardId, fd);
        }}
        className="px-6 py-5 space-y-4"
      >
        <input type="hidden" name="version" value={card.version} />

        <div>
          <label
            htmlFor="card-title"
            className="block text-xs font-medium text-neutral-400"
          >
            Title
          </label>
          <input
            id="card-title"
            type="text"
            name="title"
            required
            maxLength={200}
            defaultValue={card.title}
            disabled={!canWrite}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="card-description"
            className="block text-xs font-medium text-neutral-400"
          >
            Description
          </label>
          <textarea
            id="card-description"
            name="description"
            rows={6}
            defaultValue={card.description ?? ""}
            disabled={!canWrite}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[10px] text-neutral-600">
            version {card.version}
          </span>
          <div className="flex items-center gap-2">
            {canWrite ? (
              <>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-400 transition"
                >
                  Save
                </button>
              </>
            ) : (
              <span className="text-xs text-neutral-500">Read only</span>
            )}
            <Link
              href={`/w/${slug}/b/${boardId}`}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:bg-neutral-800 transition"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>

      <LabelsPicker
        cardId={cardId}
        workspaceId={card.list.board.workspaceId}
        initialSelected={card.cardLabels.map((cl) => cl.label)}
        canEdit={canWrite}
        canCurate={canModerate}
      />

      <AssigneesPicker
        cardId={cardId}
        workspaceId={card.list.board.workspaceId}
        initialSelected={card.assignees.map((a) => ({
          userId: a.user.id,
          name: a.user.name,
          email: a.user.email,
          image: a.user.image,
        }))}
        canEdit={canWrite}
      />

      <CommentsPanel
        cardId={cardId}
        currentUserId={currentUserId}
        canComment={canWrite}
        canModerate={canModerate}
      />

      {canWrite ? (
        <form
          action={async () => {
            "use server";
            await removeCard(slug, boardId, cardId);
          }}
          className="px-6 pb-5 border-t border-neutral-800 pt-4"
        >
          <button
            type="submit"
            className="text-xs text-red-400 hover:text-red-300 transition"
          >
            Delete card
          </button>
        </form>
      ) : null}
    </Overlay>
  );
}

function Overlay({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Link
        href={backHref}
        aria-label="Dismiss modal"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
