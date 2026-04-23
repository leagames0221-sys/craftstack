"use client";

import { useState } from "react";

const METHOD_COLORS: Record<string, string> = {
  GET: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  POST: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  PUT: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  PATCH: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  DELETE: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

type Op = Record<string, unknown>;

export function ApiOperation({
  path,
  method,
  op,
}: {
  path: string;
  method: string;
  op: Op;
}) {
  const [open, setOpen] = useState(false);
  const summary = stringProp(op, "summary");
  const description = stringProp(op, "description");
  const parameters = Array.isArray(op.parameters) ? op.parameters : [];
  const responses = isObject(op.responses) ? op.responses : {};
  const requestBody = isObject(op.requestBody) ? op.requestBody : null;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-900/80"
        aria-expanded={open}
      >
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
            METHOD_COLORS[method] ??
            "border-neutral-700 bg-neutral-900 text-neutral-300"
          }`}
        >
          {method}
        </span>
        <code className="flex-1 truncate font-mono text-xs text-neutral-200">
          {path}
        </code>
        <span
          aria-hidden
          className="text-xs text-neutral-400 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        >
          ▶
        </span>
      </button>

      {summary ? (
        <p className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-300">
          {summary}
        </p>
      ) : null}

      {open ? (
        <div className="border-t border-neutral-800 bg-neutral-950/60 px-4 py-4 text-xs">
          {description ? (
            <p className="mb-4 leading-relaxed text-neutral-400">
              {description}
            </p>
          ) : null}

          {parameters.length > 0 ? (
            <Section title="Parameters">
              <table className="w-full border-collapse text-left">
                <thead className="text-[10px] uppercase tracking-widest text-neutral-400">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">In</th>
                    <th className="pb-2 pr-3 font-medium">Required</th>
                    <th className="pb-2 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 text-neutral-300">
                  {(parameters as unknown[]).map((p, i) => {
                    const param = isObject(p) ? p : {};
                    const name = stringProp(param, "name") ?? "—";
                    const where = stringProp(param, "in") ?? "—";
                    const req = param.required === true;
                    const schema = isObject(param.schema) ? param.schema : {};
                    const type = stringProp(schema, "type") ?? "—";
                    return (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 font-mono text-[11px]">
                          {name}
                        </td>
                        <td className="py-1.5 pr-3 text-neutral-400">
                          {where}
                        </td>
                        <td className="py-1.5 pr-3 text-neutral-400">
                          {req ? "yes" : "no"}
                        </td>
                        <td className="py-1.5 font-mono text-[11px] text-neutral-400">
                          {type}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          ) : null}

          {requestBody ? (
            <Section title="Request body">
              <div className="space-y-2">
                <div className="text-neutral-400">
                  {requestBody.required === true ? "required" : "optional"}
                </div>
                {renderSchemaLine(requestBody)}
              </div>
            </Section>
          ) : null}

          <Section title="Responses">
            <ul className="space-y-1.5">
              {Object.entries(responses).map(([code, resp]) => {
                const r = isObject(resp) ? resp : {};
                const desc = stringProp(r, "description") ?? "";
                return (
                  <li
                    key={code}
                    className="flex items-start gap-3 text-neutral-300"
                  >
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${codeColor(
                        code,
                      )}`}
                    >
                      {code}
                    </span>
                    <span className="flex-1 text-neutral-400">
                      {desc || "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="mb-2 text-[10px] uppercase tracking-widest text-neutral-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function codeColor(code: string): string {
  if (code.startsWith("2"))
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (code.startsWith("3"))
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  if (code.startsWith("4"))
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (code.startsWith("5"))
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function stringProp(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function renderSchemaLine(body: Record<string, unknown>) {
  const content = isObject(body.content) ? body.content : {};
  const types = Object.keys(content);
  if (types.length === 0) return <div className="text-neutral-400">—</div>;
  return (
    <div className="space-y-1 font-mono text-[11px] text-neutral-400">
      {types.map((t) => (
        <div key={t}>{t}</div>
      ))}
    </div>
  );
}
