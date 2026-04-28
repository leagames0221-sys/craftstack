import Link from "next/link";

import { auth } from "@/auth";

export const metadata = {
  title: "craftstack · Full-stack monorepo portfolio",
  description:
    "Two production-grade SaaS built from schema to deploy: Boardly (realtime collaborative kanban) and Knowlex (AI knowledge retrieval with pgvector + HNSW). Grade-A security headers, 274 Vitest + 24 Playwright tests, zero-dollar infra.",
};

/**
 * Public landing page. Previously this route was a silent gate that
 * redirected to /signin — which made the very first impression of the
 * portfolio "a login form." The landing replaces that with a proper
 * marketing surface: hero, features, tech stack, and CTAs into both
 * the playground (no signup) and Boardly (OAuth signin).
 *
 * Authenticated visitors get the dashboard link in the hero CTA and
 * in the top nav, so the page stays useful for returning users too.
 */
export default async function Home() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500" />
            <span className="text-lg font-semibold tracking-tight">
              craftstack
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/playground"
              className="text-neutral-300 hover:text-neutral-100"
            >
              Playground
            </Link>
            <a
              href="https://github.com/leagames0221-sys/craftstack"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-300 hover:text-neutral-100"
            >
              GitHub
            </a>
            {signedIn ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-indigo-500 px-3 py-1.5 text-white hover:bg-indigo-400"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                href="/signin"
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-100 hover:bg-neutral-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <p className="text-xs uppercase tracking-[0.22em] text-indigo-300">
          Full-stack · monorepo · portfolio
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Two SaaS apps, built from schema to deploy,{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            by one engineer.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-400">
          <span className="text-neutral-200">Boardly</span>, a realtime
          collaborative kanban with DnD, optimistic locking, and a static CSP
          (rolled back from nonce + strict-dynamic per ADR-0040 to fix Vercel
          platform-script hydration; grade A on securityheaders.com).{" "}
          <span className="text-neutral-200">Knowlex</span>, a single-tenant RAG
          demo over pgvector HNSW with streamed Gemini 2.0 Flash and numbered
          citations (workspace schema partitioning shipped per ADR-0047 partial
          in v0.5.0; auth-gated access control deferred to v0.5.4). Both in one
          Turborepo, deployed on Vercel Hobby, zero dollars per month.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/playground"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Try the AI playground
            <Arrow />
          </Link>
          <Link
            href={signedIn ? "/dashboard" : "/signin"}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-5 py-3 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            {signedIn ? "Open Boardly dashboard" : "Sign in to Boardly"}
            <Arrow />
          </Link>
          <a
            href="https://www.loom.com/share/1f6915e588cb4176bfc8272f0f9310bb"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            ▶ Boardly walkthrough (45 s)
          </a>
          <a
            href="https://www.loom.com/share/acff991e3da94d5aa4e98dcee0b100e2"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/60 px-5 py-3 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            ▶ Knowlex RAG walkthrough (33 s)
          </a>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-6 text-xs text-neutral-400 md:grid-cols-4">
          <Stat label="Vitest cases" value="274" />
          <Stat label="Playwright" value="24" />
          <Stat label="Next routes" value="39" />
          <Stat label="ADRs" value="65" />
          <Stat label="Security Headers" value="A" />
          <Stat label="Monthly infra" value="$0" />
          <Stat label="Prisma models" value="19 + 4" />
          <Stat label="Markdown docs" value="6.9k lines" />
        </div>
      </section>

      <section className="border-t border-neutral-800 bg-neutral-900/40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-20 md:grid-cols-2">
          <AppCard
            gradient="from-indigo-500/40 via-violet-500/30 to-transparent"
            badge="Shipped · live"
            title="Boardly"
            tagline="Realtime collaborative kanban"
            bullets={[
              "Drag-and-drop with LexoRank positions + optimistic locking via version column",
              "Pusher Channels for realtime fanout with best-effort side-effect policy",
              "Token-hashed invitations + three-layer rate limit + @mentions + notifications bell",
              "Full ⌘K command palette, WIP limits, labels, assignees, due dates, activity log",
            ]}
            primary={{
              href: signedIn ? "/dashboard" : "/signin",
              label: signedIn ? "Go to dashboard" : "Sign in with OAuth",
            }}
            secondary={{
              href: "https://github.com/leagames0221-sys/craftstack/tree/main/apps/collab",
              label: "Source on GitHub →",
            }}
          />

          <AppCard
            gradient="from-violet-500/40 via-cyan-500/30 to-transparent"
            badge="Live · own Vercel deploy"
            title="Knowlex"
            tagline="Grounded AI knowledge retrieval"
            bullets={[
              "Paste text → chunked + embedded (text-embedding-004, 768-dim) → stored in pgvector",
              "Ask a question → cosine-kNN retrieval → Gemini 2.0 Flash answer with numbered citations",
              "Env-guarded: missing GEMINI_API_KEY returns a clean 503, never a crash — corpus stays intact",
              "Standalone apps/knowledge Next app, own Prisma migration, own Vitest, own Vercel project",
            ]}
            primary={{
              href: "https://craftstack-knowledge.vercel.app",
              label: "Open live Knowlex ↗",
            }}
            secondary={{
              href: "https://github.com/leagames0221-sys/craftstack/tree/main/apps/knowledge",
              label: "apps/knowledge source →",
            }}
          />
        </div>
      </section>

      <section className="border-t border-neutral-800">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight">
            Ten decisions worth drilling into
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-neutral-400">
            Each of these is captured as a one-page Architectural Decision
            Record in{" "}
            <a
              href="https://github.com/leagames0221-sys/craftstack/tree/main/docs/adr"
              className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
              target="_blank"
              rel="noreferrer"
            >
              docs/adr/
            </a>
            . The author can whiteboard any of them in an interview.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "Four-tier RBAC",
                "OWNER > ADMIN > EDITOR > VIEWER via a single roleAtLeast comparator",
              ],
              [
                "Optimistic locking",
                "version column + updateMany, bumped client-side on success",
              ],
              ["LexoRank positions", "Reorder touches one row, not N"],
              [
                "Token-hashed invitations",
                "Only SHA-256 stored; accept requires email match",
              ],
              [
                "3-layer rate limit",
                "Global + per-workspace + per-user, each with distinct error codes",
              ],
              [
                "Full-replace set semantics",
                "PUT labels/assignees; diffs + side-effects for additions only",
              ],
              [
                "Cross-workspace guards",
                "Label / assignee writes validated against the card's workspace",
              ],
              [
                "Best-effort side effects",
                "Log / broadcast / email fail without aborting the business write",
              ],
              [
                "URL as state",
                "Filters + search in query string — shareable, refresh-safe, composable",
              ],
              [
                "Env-guarded integrations",
                "Pusher, Resend, Gemini all degrade gracefully when unset",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
              >
                <h3 className="text-sm font-semibold text-neutral-100">
                  {title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800 bg-neutral-900/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold tracking-tight">Tech stack</h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-neutral-300 md:grid-cols-4">
            {[
              "Next.js 16",
              "TypeScript 5",
              "React 19",
              "Prisma 7",
              "PostgreSQL (Neon)",
              "Auth.js v5 (JWT)",
              "Pusher Channels",
              "Vercel AI SDK",
              "Gemini 2.0 Flash",
              "cmdk (⌘K)",
              "@dnd-kit",
              "Tailwind 4",
              "Vitest",
              "Playwright",
              "Resend",
              "Vercel Hobby",
            ].map((t) => (
              <li
                key={t}
                className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1"
              >
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-neutral-400">
            Every service above is free-tier; no credit card on file. The apps
            degrade gracefully when an integration key is missing.
          </p>
        </div>
      </section>

      <footer className="border-t border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-neutral-400">
          <span>© {new Date().getFullYear()} · craftstack</span>
          <div className="flex gap-4">
            <a
              href="https://github.com/leagames0221-sys/craftstack"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              GitHub
            </a>
            <a
              href="https://github.com/leagames0221-sys/craftstack/tree/main/docs/adr"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              ADRs
            </a>
            <Link
              href="/docs/api"
              className="hover:text-neutral-300"
              title="Interactive API reference (OpenAPI 3.1)"
            >
              API Reference
            </Link>
            <Link
              href="/status"
              className="hover:text-neutral-300"
              title="Live integration-health board"
            >
              Status
            </Link>
            <a
              href="https://securityheaders.com/?q=https%3A%2F%2Fcraftstack-collab.vercel.app%2F&followRedirects=on"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              Security A
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-neutral-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

function AppCard({
  gradient,
  badge,
  title,
  tagline,
  bullets,
  primary,
  secondary,
}: {
  gradient: string;
  badge: string;
  title: string;
  tagline: string;
  bullets: string[];
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradient}`}
      />
      <div className="relative">
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-neutral-300">
          {badge}
        </span>
        <h3 className="mt-4 text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-neutral-400">{tagline}</p>
        <ul className="mt-5 space-y-2 text-sm text-neutral-300">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={primary.href}
            className="rounded-lg bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400"
          >
            {primary.label}
          </Link>
          <a
            href={secondary.href}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-300 hover:text-neutral-100"
          >
            {secondary.label}
          </a>
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
