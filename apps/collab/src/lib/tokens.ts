import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a URL-safe random token and its SHA-256 hash. The plaintext is
 * shown to the user once (in the invitation link); only the hash is persisted,
 * so leaking the DB does not leak the acceptable tokens.
 */
export function issueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
