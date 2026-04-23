import Link from "next/link";

import { openApiSpec } from "@/openapi";

import { ApiOperation } from "./ApiOperation";

export const metadata = {
  title: "Knowlex API Reference",
  description:
    "Full OpenAPI 3.1 reference for the Knowlex REST surface. Hand-written spec; point Swagger Editor at /api/openapi.json for an interactive explorer.",
};

/**
 * Server-rendered API reference for Knowlex. Mirrors the Boardly
 * `/docs/api` page (same ApiOperation component pattern) so both apps
 * document themselves identically. The spec lives in
 * `apps/knowledge/src/openapi.ts` and is also served as JSON at
 * `/api/openapi.json`.
 */
export default function DocsApiPage() {
  const spec = openApiSpec;
  const paths = Object.entries(spec.paths) as Array<
    [string, Record<string, unknown>]
  >;

  type Op = {
    path: string;
    method: string;
    op: Record<string, unknown>;
  };

  const opsByTag = new Map<string, Op[]>();
  for (const [path, methods] of paths) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== "object") continue;
      const methodUpper = method.toUpperCase();
      if (
        !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
          methodUpper,
        )
      ) {
        continue;
      }
      const tags = (op as { tags?: string[] }).tags ?? ["Other"];
      for (const tag of tags) {
        if (!opsByTag.has(tag)) opsByTag.set(tag, []);
        opsByTag.get(tag)!.push({
          path,
          method: methodUpper,
          op: op as Record<string, unknown>,
        });
      }
    }
  }

  const orderedTags: string[] = (spec.tags ?? []).map((t) => t.name);
  for (const tag of opsByTag.keys()) {
    if (!orderedTags.includes(tag)) orderedTags.push(tag);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← Knowlex
            </Link>
            <span className="text-neutral-700">/</span>
            <h1 className="text-lg font-semibold tracking-tight">
              API Reference
            </h1>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-200">
              OpenAPI {String(spec.openapi)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a
              href="/api/openapi.json"
              className="text-neutral-400 hover:text-neutral-200"
              title="Raw OpenAPI 3.1 JSON"
            >
              Raw JSON →
            </a>
            <a
              href="https://editor.swagger.io/?url=https%3A%2F%2Fcraftstack-knowledge.vercel.app%2Fapi%2Fopenapi.json"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800"
            >
              Try in Swagger Editor ↗
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-12 gap-8 px-6 py-10">
        <aside className="col-span-12 md:col-span-3">
          <div className="sticky top-24 space-y-4">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-neutral-400">
                {spec.info.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                v{spec.info.version}
              </p>
            </div>
            <nav className="space-y-1">
              {orderedTags.map((tag) => {
                const count = opsByTag.get(tag)?.length ?? 0;
                if (count === 0) return null;
                return (
                  <a
                    key={tag}
                    href={`#tag-${slug(tag)}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900/60 hover:text-neutral-100"
                  >
                    <span>{tag}</span>
                    <span className="text-[10px] text-neutral-400">
                      {count}
                    </span>
                  </a>
                );
              })}
            </nav>
            <div className="pt-4 text-[10px] leading-relaxed text-neutral-400">
              Hand-written OpenAPI per{" "}
              <a
                href="https://github.com/leagames0221-sys/craftstack/blob/main/docs/adr/0035-hand-written-openapi-as-the-contract.md"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
              >
                ADR-0035
              </a>
              .
            </div>
          </div>
        </aside>

        <section className="col-span-12 md:col-span-9">
          <div className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight">
              {spec.info.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-400">
              {spec.info.description}
            </p>
          </div>

          {orderedTags.map((tag) => {
            const ops = opsByTag.get(tag);
            if (!ops || ops.length === 0) return null;
            const tagMeta = spec.tags?.find((t) => t.name === tag);
            return (
              <section
                key={tag}
                id={`tag-${slug(tag)}`}
                className="mb-12 scroll-mt-24"
              >
                <div className="mb-4 border-b border-neutral-800 pb-3">
                  <h3 className="text-xl font-semibold text-neutral-100">
                    {tag}
                  </h3>
                  {tagMeta?.description ? (
                    <p className="mt-1 text-sm text-neutral-400">
                      {tagMeta.description}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {ops.map((o) => (
                    <ApiOperation
                      key={`${o.method}:${o.path}`}
                      path={o.path}
                      method={o.method}
                      op={o.op}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </section>
      </div>

      <footer className="border-t border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-neutral-400">
          <span>
            Generated from{" "}
            <code className="text-neutral-400">src/openapi.ts</code>.
          </span>
          <Link href="/" className="hover:text-neutral-300">
            ← back to Knowlex
          </Link>
        </div>
      </footer>
    </main>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
