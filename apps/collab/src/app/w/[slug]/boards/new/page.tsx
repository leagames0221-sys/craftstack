import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError } from "@/lib/errors";
import { createBoard } from "@/server/board";

export const metadata = {
  title: "New board · Boardly",
};

export default async function NewBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; title?: string; color?: string }>;
}) {
  const session = await auth();
  const { slug } = await params;
  if (!session?.user) redirect(`/signin?callbackUrl=/w/${slug}/boards/new`);

  const sp = await searchParams;
  const priorTitle = sp.title ?? "";
  const priorColor = sp.color ?? "#6366F1";

  async function submit(formData: FormData) {
    "use server";
    const session = await auth();
    const { slug } = await params;
    if (!session?.user) redirect(`/signin?callbackUrl=/w/${slug}/boards/new`);

    const title = String(formData.get("title") ?? "").trim();
    const color = String(formData.get("color") ?? "#6366F1");

    if (!title || title.length > 120) {
      const qs = new URLSearchParams({
        error: "Title must be 1-120 characters",
        title,
        color,
      });
      redirect(`/w/${slug}/boards/new?${qs.toString()}`);
    }

    try {
      const board = await createBoard(session.user.id, slug, { title, color });
      redirect(`/w/${slug}/b/${board.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const qs = new URLSearchParams({ error: err.message, title, color });
        redirect(`/w/${slug}/boards/new?${qs.toString()}`);
      }
      throw err;
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-16">
        <Link
          href={`/w/${slug}`}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← Back to workspace
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">New board</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Boards group lists and cards. You can archive them later.
        </p>

        {sp.error ? (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {sp.error}
          </div>
        ) : null}

        <form action={submit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-neutral-300"
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              maxLength={120}
              defaultValue={priorTitle}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
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
              Create board
            </button>
            <Link
              href={`/w/${slug}`}
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
