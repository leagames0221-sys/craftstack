import { signIn } from "@/auth";

/**
 * Knowlex sign-in page (ADR-0061).
 *
 * Mirrors apps/collab's signin shape but minimal: two OAuth buttons
 * (Google + GitHub) and a callback hint. The signed-in user lands
 * back on `/` (the RAG ask page); from there `/kb` is the ingest UI
 * which the `requireMemberForWrite` gate now permits.
 *
 * The demo workspace remains anonymously accessible from `/`
 * (per ADR-0061 § Demo split), so signing in is not required to try
 * the live RAG demo. Sign-in unlocks ingest + future per-user
 * workspaces.
 */
export default function SignInPage() {
  async function signinGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }
  async function signinGithub() {
    "use server";
    await signIn("github", { redirectTo: "/" });
  }
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to Knowlex</h1>
      <p className="text-sm text-zinc-500">
        Sign in to ingest documents and access non-demo workspaces. The demo
        workspace at <code>/</code> remains accessible without signing in.
      </p>
      <div className="flex w-full flex-col gap-3">
        <form action={signinGoogle}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Continue with Google
          </button>
        </form>
        <form action={signinGithub}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Continue with GitHub
          </button>
        </form>
      </div>
      <p className="text-xs text-zinc-400">
        ADR-0061 — Auth.js v5 on Knowlex. Closes I-01.
      </p>
    </main>
  );
}
