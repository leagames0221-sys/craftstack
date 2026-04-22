/**
 * Lightweight input validation without pulling in zod.
 * Throws BadRequestError with structured `details` when something is wrong.
 */
import { BadRequestError } from "./errors";

const SLUG_RE = /^[a-z0-9-]{3,32}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function parseCreateWorkspaceInput(raw: unknown): {
  name: string;
  slug: string;
  color?: string;
} {
  if (typeof raw !== "object" || raw === null) {
    throw new BadRequestError("Request body must be an object");
  }

  const errors: Record<string, string> = {};
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name || name.length > 80) {
    errors.name = "name must be a non-empty string up to 80 characters";
  }

  const slug = typeof r.slug === "string" ? r.slug.trim().toLowerCase() : "";
  if (!SLUG_RE.test(slug)) {
    errors.slug =
      "slug must be 3-32 characters, lowercase letters, digits, or hyphens";
  }

  let color: string | undefined;
  if (r.color !== undefined) {
    if (typeof r.color !== "string" || !COLOR_RE.test(r.color)) {
      errors.color = "color must be a #RRGGBB hex string";
    } else {
      color = r.color;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestError("Invalid request body", { fieldErrors: errors });
  }

  return { name, slug, color };
}
