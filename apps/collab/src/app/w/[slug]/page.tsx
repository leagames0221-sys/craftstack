import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWorkspaceForMember } from "@/server/workspace-detail";
import { MembersSection } from "./MembersSection";
import { ActivityFeed } from "./ActivityFeed";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `${slug} · Boardly` };
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { slug } = await params;
    redirect(`/signin?callbackUrl=/w/${slug}`);
  }

  const { slug } = await params;
  const ws = await loadWorkspaceForMember(session.user.id, slug);
  if (!ws) notFound();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-lg"
              style={{ backgroundColor: ws.color }}
              aria-hidden="true"
            />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {ws.name}
              </h1>
              <p className="text-xs text-neutral-500">/w/{ws.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/dashboard"
              className="text-neutral-400 hover:text-neutral-200"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Boards</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {ws.boards.length === 0
                ? "No boards yet. Create your first board to get started."
                : `${ws.boards.length} board${ws.boards.length === 1 ? "" : "s"} in this workspace.`}
            </p>
          </div>
          {(ws.role === "OWNER" ||
            ws.role === "ADMIN" ||
            ws.role === "EDITOR") && (
            <Link
              href={`/w/${ws.slug}/boards/new`}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
            >
              New board
            </Link>
          )}
        </div>

        {ws.boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-16 text-center">
            <p className="text-neutral-300">No boards yet</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ws.boards.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/w/${ws.slug}/b/${b.id}`}
                  className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700 hover:bg-neutral-900/80 transition"
                >
                  <div
                    className="mb-3 h-10 w-full rounded-lg"
                    style={{ backgroundColor: b.color }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{b.title}</span>
                    {b.archived && (
                      <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
                        archived
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <MembersSection
          workspaceId={ws.id}
          canInvite={ws.role === "OWNER" || ws.role === "ADMIN"}
          members={ws.members.map((m) => ({
            userId: m.userId,
            email: m.email,
            name: m.name,
            role: m.role,
          }))}
          invitations={ws.pendingInvitations}
          myRole={ws.role}
        />

        <ActivityFeed workspaceId={ws.id} />
      </div>
    </main>
  );
}
