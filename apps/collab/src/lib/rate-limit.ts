/**
 * Static rate limit configuration for abuse-prone endpoints. All numbers are
 * override-able via env so reviewers can pin them low (portfolio demo) and
 * production can relax them without a code change.
 *
 * Semantics:
 *  - globalPerMonth: rolling 30-day cap counted across every workspace.
 *    Caps the overall email spend from a single malicious account that
 *    somehow gained ADMIN on many workspaces.
 *  - perWorkspacePerDay: rolling 24h cap per workspace.
 *  - perUserPerDay: rolling 24h cap per inviting user.
 *
 * All three are enforced on `createInvitation`; any one tripping causes a
 * 429 response with a specific error code so the caller can tell which
 * limit they hit.
 */

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function inviteLimits() {
  return {
    globalPerMonth: num("INVITE_LIMIT_GLOBAL_PER_MONTH", 1000),
    perWorkspacePerDay: num("INVITE_LIMIT_WORKSPACE_PER_DAY", 50),
    perUserPerDay: num("INVITE_LIMIT_USER_PER_DAY", 20),
  };
}
