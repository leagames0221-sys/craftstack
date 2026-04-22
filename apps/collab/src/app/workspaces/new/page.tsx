import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { parseCreateWorkspaceInput } from "@/lib/validation";
import { createWorkspace } from "@/server/workspace";
import { ApiError } from "@/lib/errors";

export const metadata = {
  title: "New workspace · Boardly",
};

type FormState = { fieldErrors?: Record<string, string>; error?: string };

export default async function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    name?: string;
    slug?: string;
    color?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/workspaces/new");

  const params = await searchParams;
  const priorName = params.name ?? "";
  const priorSlug = params.slug ?? "";
  const priorColor = params.color ?? "#4F46E5";
  const showError: FormState = params.error ? { error: params.error } : {};

  async function submit(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user) redirect("/signin?callbackUrl=/workspaces/new");

    const raw = {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      color: String(formData.get("color") ?? ""),
    };

    try {
      const input = parseCreateWorkspaceInput(raw);
      await createWorkspace(session.user.id, input);
      redirect(`/w/${input.slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const params = new URLSearchParams({
          error: err.message,
          name: raw.name,
          slug: raw.slug,
          color: raw.color,
        });
        redirect(`/workspaces/new?${params.toString()}`);
      }
      throw err;
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-16">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← Back to dashboard
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          Create a workspace
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Each workspace has its own boards, members, and permissions.
        </p>

        {showError.error ? (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {showError.error}
          </div>
        ) : null}

        <form action={submit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-neutral-300"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={80}
              defaultValue={priorName}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label
              htmlFor="slug"
              className="block text-sm font-medium text-neutral-300"
            >
              Slug
            </label>
            <div className="mt-1 flex items-stretch rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400">
              <span className="px-3 py-2 text-neutral-500 border-r border-neutral-700 text-sm">
                boardly.app/w/
              </span>
              <input
                id="slug"
                name="slug"
                required
                pattern="[a-z0-9-]{3,32}"
                defaultValue={priorSlug}
                className="flex-1 bg-transparent px-3 py-2 text-neutral-100 focus:outline-none"
                placeholder="demo-team"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              3-32 characters, lowercase letters, digits, hyphens.
            </p>
          </div>

          <div>
            <label
              htmlFor="color"
              className="block text-sm font-medium text-neutral-300"
            >
              Color
            </label>
            <input
              id="color"
              name="color"
              type="color"
              defaultValue={priorColor}
              className="mt-1 h-10 w-20 rounded-lg border border-neutral-700 bg-neutral-900"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
            >
              Create workspace
            </button>
            <Link
              href="/dashboard"
              className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
