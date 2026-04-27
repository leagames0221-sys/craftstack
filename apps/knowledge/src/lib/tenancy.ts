/**
 * Workspace tenancy helpers (ADR-0047 v0.5.0 partial implementation).
 *
 * v0.5.0 ships **schema partitioning only** — the Workspace table
 * exists, every Document is backfilled to a default workspace, and
 * routes accept an optional `workspaceId` parameter that scopes
 * queries. Member-based access control (auth-gated guards) is
 * deferred to v0.5.4 once Auth.js lands on the Knowlex deploy.
 * (Originally targeted v0.5.2; revised because v0.5.2 scope was
 * redirected to the schema-vs-prod drift forensic per ADR-0051.)
 *
 * The `TENANCY_ENABLED` env flag controls whether routes treat the
 * `workspaceId` parameter as load-bearing:
 *
 *   - flag absent / false: every request resolves to the default
 *     workspace regardless of what the request supplied. The route's
 *     behaviour is byte-identical to v0.4.x. The flag-off path is the
 *     one that ships to production at v0.5.0 ship-time so the live
 *     URL doesn't flip until Auth.js + workspace UI are ready.
 *
 *   - flag true: the `workspaceId` parameter is honoured. A request
 *     with `workspaceId=wks_X` ingests / asks against workspace X
 *     only. A request without `workspaceId` still falls back to the
 *     default workspace so callers that haven't been updated keep
 *     working.
 *
 * Cross-workspace data leakage is prevented at the query layer (every
 * read filters by `Document.workspaceId`). With auth deferred, a
 * malicious caller could still target any workspace they know the id
 * of — that's why ADR-0047 § Status calls this "Partially Accepted":
 * the schema gate is real, the access gate is not yet.
 */

export const DEFAULT_WORKSPACE_ID = "wks_default_v050";
export const DEFAULT_WORKSPACE_SLUG = "default";

/**
 * Read the tenancy feature flag. Both client- and server-side callers
 * can use this; the client-side variant `NEXT_PUBLIC_TENANCY_ENABLED`
 * is read separately by Next.js's static-analysis on `process.env`.
 */
export function isTenancyEnabled(): boolean {
  const v = process.env.TENANCY_ENABLED;
  return v === "1" || v === "true";
}

/**
 * Resolve the workspace id a request will operate against. With the
 * flag off, always returns the default; with the flag on, accepts a
 * caller-supplied id and falls back to the default when missing.
 *
 * Whitespace and case are normalised. The id is NOT validated against
 * the Workspace table here — that's the caller's responsibility (a
 * 404 lookup ergonomically belongs at the route level).
 */
export function resolveWorkspaceId(supplied: unknown): string {
  if (!isTenancyEnabled()) return DEFAULT_WORKSPACE_ID;
  if (typeof supplied !== "string") return DEFAULT_WORKSPACE_ID;
  const trimmed = supplied.trim();
  if (trimmed.length === 0) return DEFAULT_WORKSPACE_ID;
  return trimmed;
}
