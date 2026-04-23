import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { listWorkspacesForUser } from "@/server/workspace";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";

export const metadata = {
  title: "Dashboard · Boardly",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/dashboard");

  const workspaces = await listWorkspacesForUser(session.user.id);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
            <h1 className="text-lg font-semibold tracking-tight">Boardly</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/playground"
              className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/20 transition"
            >
              Knowlex ✨
            </Link>
            <CommandPalette />
            <NotificationsBell />
            <ShortcutsHelp />
            <span className="text-neutral-400">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-800 transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Your workspaces
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {workspaces.length === 0
                ? "You do not belong to a workspace yet."
                : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"} accessible to you.`}
            </p>
          </div>
          <Link
            href="/workspaces/new"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
          >
            New workspace
          </Link>
        </div>

        {workspaces.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/w/${ws.slug}`}
                  className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700 hover:bg-neutral-900/80 transition"
                >
                  <div
                    className="mb-3 h-10 w-10 rounded-lg"
                    style={{ backgroundColor: ws.color }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">{ws.name}</span>
                    <RoleBadge role={ws.role} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">/{ws.slug}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 px-6 py-16 text-center">
      <p className="text-neutral-300">No workspaces yet</p>
      <p className="mt-1 text-sm text-neutral-500">
        Create your first workspace to start collaborating.
      </p>
      <Link
        href="/workspaces/new"
        className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
      >
        Create workspace
      </Link>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    OWNER: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    ADMIN: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    EDITOR: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    VIEWER: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30",
  };
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        styles[role] ?? styles.VIEWER
      }`}
    >
      {role}
    </span>
  );
}
