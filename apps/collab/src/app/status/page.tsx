import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Status",
  description:
    "Live integration-health dashboard for the craftstack deployment. Shows whether each optional service (Pusher, Resend, Gemini) is currently wired or running in its env-guarded fallback.",
};

/**
 * Public status page. Inspects the presence (not the value) of each optional
 * integration env var and renders a compact, honest health board. Because
 * every integration is env-guarded, "unset" is a valid operational state —
 * the app still works, just without realtime fanout or email delivery or
 * live Gemini. Surfacing that state keeps the demo honest for a recruiter:
 * they can tell at a glance which paths are real and which are graceful-
 * degrade fallbacks.
 *
 * No secrets leak — only booleans ("present" / "absent") are ever rendered.
 */
export default async function StatusPage() {
  const integrations: Integration[] = [
    {
      name: "Database (Neon Postgres)",
      present: has("DATABASE_URL"),
      role: "required",
      describe: {
        present:
          "Connected to a Postgres instance — every authenticated flow works end-to-end.",
        absent:
          "No DATABASE_URL; this shouldn't happen on the live deploy — if you see this, something is misconfigured.",
      },
    },
    {
      name: "Auth.js (JWT)",
      present: has("AUTH_SECRET"),
      role: "required",
      describe: {
        present: "JWT session strategy configured.",
        absent: "AUTH_SECRET missing — signin will fail.",
      },
    },
    {
      name: "GitHub OAuth",
      present: has("GITHUB_CLIENT_ID") && has("GITHUB_CLIENT_SECRET"),
      role: "required",
      describe: {
        present: "Sign in with GitHub is live (recommended for reviewers).",
        absent: "GitHub provider not wired.",
      },
    },
    {
      name: "Google OAuth",
      present: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET"),
      role: "optional",
      describe: {
        present:
          "Sign in with Google is live (still in Google's Testing status — only pre-registered users).",
        absent: "Google provider not wired.",
      },
    },
    {
      name: "Gemini 2.0 Flash (Knowlex)",
      present: has("GEMINI_API_KEY"),
      role: "optional",
      describe: {
        present:
          "/playground streams live Gemini 2.0 Flash answers. Per-IP + global budget caps in place.",
        absent:
          "/playground runs in deterministic demo mode (same streaming UX, canned answer). Set GEMINI_API_KEY — AI Studio key, NOT a billing-enabled Cloud key — to switch to live.",
      },
      doc: "/COST_SAFETY.md",
    },
    {
      name: "Pusher Channels (realtime)",
      present:
        has("PUSHER_APP_ID") &&
        has("PUSHER_KEY") &&
        has("PUSHER_SECRET") &&
        has("PUSHER_CLUSTER") &&
        has("NEXT_PUBLIC_PUSHER_KEY") &&
        has("NEXT_PUBLIC_PUSHER_CLUSTER"),
      role: "optional",
      describe: {
        present: "Board mutations fan out to connected clients in realtime.",
        absent:
          "broadcast() is a no-op; board state refreshes on your own mutations. Free-tier Pusher Sandbox (200k msg/day) is enough to enable.",
      },
    },
    {
      name: "Resend (invitation emails)",
      present: has("RESEND_API_KEY"),
      role: "optional",
      describe: {
        present: "Invitation emails actually deliver via Resend.",
        absent:
          "Invites still succeed — the accept URL is surfaced in the UI and logged to the server console; Resend delivery just doesn't fire.",
      },
    },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← craftstack
            </Link>
            <span className="text-neutral-700">/</span>
            <h1 className="text-lg font-semibold tracking-tight">Status</h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            live
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-10">
        <h2 className="text-2xl font-bold tracking-tight">
          Integration health
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-neutral-400">
          Every external service this project talks to is optional. Missing
          credentials don't break the app — they degrade to a graceful fallback.
          This page shows which paths are currently live.
        </p>

        <ul className="mt-8 divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
          {integrations.map((i) => (
            <IntegrationRow key={i.name} i={i} />
          ))}
        </ul>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoCard
            title="Cost stance"
            href="/COST_SAFETY.md"
            body="$0/month under adversarial traffic. Full threat model in COST_SAFETY.md."
          />
          <InfoCard
            title="Security headers"
            href="https://securityheaders.com/?q=https%3A%2F%2Fcraftstack-collab.vercel.app%2F&followRedirects=on"
            body="A+ on securityheaders.com (nonce-based CSP + strict-dynamic)."
          />
          <InfoCard
            title="API contract"
            href="/docs/api"
            body="OpenAPI 3.1 served at /api/openapi.json, interactive reference at /docs/api."
          />
        </div>
      </section>

      <footer className="border-t border-neutral-800">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-neutral-500">
          <span>
            This page inspects{" "}
            <code className="text-neutral-400">process.env</code> presence only
            — no secret values are ever rendered or logged.
          </span>
          <Link href="/" className="hover:text-neutral-300">
            ← back
          </Link>
        </div>
      </footer>
    </main>
  );
}

type Integration = {
  name: string;
  present: boolean;
  role: "required" | "optional";
  describe: { present: string; absent: string };
  doc?: string;
};

function IntegrationRow({ i }: { i: Integration }) {
  const statusLabel = i.present
    ? "live"
    : i.role === "required"
      ? "missing"
      : "demo / fallback";
  const statusClass = i.present
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : i.role === "required"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-neutral-100">{i.name}</h3>
          <span className="rounded-full border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
            {i.role}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
          {i.present ? i.describe.present : i.describe.absent}
          {i.doc ? (
            <>
              {" "}
              <a href={i.doc} className="text-indigo-300 hover:text-indigo-200">
                More →
              </a>
            </>
          ) : null}
        </p>
      </div>
      <span
        className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
      >
        ● {statusLabel}
      </span>
    </li>
  );
}

function InfoCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  const external = href.startsWith("http");
  const inner = (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 hover:border-neutral-700">
      <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-neutral-400">{body}</p>
    </div>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}

function has(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.length > 0;
}
