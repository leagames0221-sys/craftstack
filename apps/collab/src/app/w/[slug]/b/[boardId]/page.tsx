import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

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
      lists: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, dueDate: true },
          },
        },
      },
    },
  });

  if (!board) notFound();

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
            {board.lists.length} list{board.lists.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-full px-6 py-6 overflow-x-auto">
        {board.lists.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-16 text-center">
            <p className="text-neutral-300">No lists yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Realtime list editing arrives in Week 6.
            </p>
          </div>
        ) : (
          <ol className="flex gap-4 items-start">
            {board.lists.map((l) => (
              <li
                key={l.id}
                className="min-w-[280px] max-w-[280px] rounded-2xl bg-neutral-900 border border-neutral-800 p-3"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold">{l.title}</h3>
                  <span className="text-[10px] text-neutral-500">
                    {l.cards.length}
                    {l.wipLimit ? `/${l.wipLimit}` : ""}
                  </span>
                </div>
                <ul className="space-y-2">
                  {l.cards.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg bg-neutral-800/60 border border-neutral-700/70 px-3 py-2 text-sm hover:bg-neutral-800 transition cursor-pointer"
                    >
                      {c.title}
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
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
