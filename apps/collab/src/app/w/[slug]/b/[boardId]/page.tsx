import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { addCard, addList } from "./actions";

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
}: {
  params: Promise<{ slug: string; boardId: string }>;
}) {
  const session = await auth();
  const { slug, boardId } = await params;
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
            select: { id: true, title: true, dueDate: true, version: true },
          },
        },
      },
    },
  });

  if (!board) notFound();

  const role = board.workspace.memberships[0]?.role ?? "VIEWER";
  const canWrite = role === "OWNER" || role === "ADMIN" || role === "EDITOR";

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
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {board.lists.length} list{board.lists.length === 1 ? "" : "s"} ·
            role {role}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-full px-6 py-6 overflow-x-auto">
        <ol className="flex gap-4 items-start min-h-[70vh]">
          {board.lists.map((l) => (
            <li
              key={l.id}
              className="min-w-[300px] max-w-[300px] rounded-2xl bg-neutral-900 border border-neutral-800 p-3 flex flex-col"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{l.title}</h3>
                <span className="text-[10px] text-neutral-500">
                  {l.cards.length}
                  {l.wipLimit ? `/${l.wipLimit}` : ""}
                </span>
              </div>

              <ul className="space-y-2 flex-1">
                {l.cards.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg bg-neutral-800/60 border border-neutral-700/70 px-3 py-2 text-sm hover:bg-neutral-800 transition"
                  >
                    <div className="font-medium">{c.title}</div>
                    {c.dueDate && (
                      <div className="mt-1 text-[10px] text-neutral-500">
                        due {new Date(c.dueDate).toISOString().slice(0, 10)}
                      </div>
                    )}
                  </li>
                ))}
                {l.cards.length === 0 && (
                  <li className="px-3 py-2 text-xs text-neutral-500">
                    No cards yet.
                  </li>
                )}
              </ul>

              {canWrite && (
                <form
                  action={async (fd) => {
                    "use server";
                    await addCard(slug, boardId, l.id, fd);
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
              )}
            </li>
          ))}

          {canWrite && (
            <li className="min-w-[300px] max-w-[300px] rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-3">
              <form
                action={async (fd) => {
                  "use server";
                  await addList(slug, boardId, fd);
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
                  className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 transition"
                >
                  Create list
                </button>
              </form>
            </li>
          )}

          {board.lists.length === 0 && !canWrite && (
            <li className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-16 text-center text-neutral-300">
              No lists yet — ask an Editor to create one.
            </li>
          )}
        </ol>
      </div>
    </main>
  );
}
