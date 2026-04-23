import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError } from "@/lib/errors";
import { acceptInvitation } from "@/server/invitation";

export const metadata = { title: "Join workspace · Boardly" };

/**
 * Invitation landing page. If the user is signed in, we attempt to accept
 * immediately — success redirects to the workspace, errors render inline.
 * If signed out, we ask them to sign in; Auth.js bounces back here via the
 * callbackUrl so the second render picks up and calls accept().
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.email) {
    const callback = encodeURIComponent(`/invite/${token}`);
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re invited to Boardly
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Sign in to accept this invitation. Your email address must match the
          one the invitation was sent to.
        </p>
        <Link
          href={`/signin?callbackUrl=${callback}`}
          className="mt-6 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
        >
          Sign in to accept
        </Link>
      </Shell>
    );
  }

  try {
    const result = await acceptInvitation(
      session.user.id,
      session.user.email,
      token,
    );
    redirect(`/w/${result.workspaceSlug}`);
  } catch (err) {
    // Let Next.js redirects propagate — they throw a special error.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    if (err instanceof ApiError) {
      return (
        <Shell>
          <h1 className="text-xl font-semibold tracking-tight text-red-300">
            Couldn&apos;t accept invitation
          </h1>
          <p className="mt-2 text-sm text-neutral-300">{err.message}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Error code: <code>{err.code}</code>
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
          >
            Back to dashboard
          </Link>
        </Shell>
      );
    }
    throw err;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </main>
  );
}
