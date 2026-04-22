"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ApiError } from "@/lib/errors";
import { createCard, updateCard } from "@/server/card";
import { createList } from "@/server/list";

/**
 * Server actions wired up by the kanban UI on `/w/[slug]/b/[boardId]`.
 * Each action:
 *   - re-validates the caller's session
 *   - delegates to the typed server layer (RBAC + optimistic locking
 *     enforced there)
 *   - calls revalidatePath so the board page re-renders with the new row
 * Returns a structured result so forms can surface field errors inline
 * instead of throwing (which is fine for actions but awkward UX-wise).
 */

type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export async function addList(
  slug: string,
  boardId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, code: "UNAUTHORIZED", message: "Sign in required" };
  }
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "Title is required",
      fieldErrors: { title: "required" },
    };
  }

  try {
    const list = await createList(session.user.id, boardId, { title });
    revalidatePath(`/w/${slug}/b/${boardId}`);
    return { ok: true, value: { id: list.id } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function addCard(
  slug: string,
  boardId: string,
  listId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, code: "UNAUTHORIZED", message: "Sign in required" };
  }
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "Title is required",
      fieldErrors: { title: "required" },
    };
  }

  try {
    const card = await createCard(session.user.id, listId, { title });
    revalidatePath(`/w/${slug}/b/${boardId}`);
    return { ok: true, value: { id: card.id } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function renameCard(
  slug: string,
  boardId: string,
  cardId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, code: "UNAUTHORIZED", message: "Sign in required" };
  }
  const title = String(formData.get("title") ?? "").trim();
  const version = Number(formData.get("version"));
  if (!title || !Number.isInteger(version)) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "Invalid body",
      fieldErrors: {
        ...(title ? {} : { title: "required" }),
        ...(Number.isInteger(version) ? {} : { version: "required" }),
      },
    };
  }

  try {
    await updateCard(session.user.id, cardId, { version, title });
    revalidatePath(`/w/${slug}/b/${boardId}`);
    return { ok: true, value: undefined };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        fieldErrors:
          (err.details?.fieldErrors as Record<string, string>) ?? undefined,
      };
    }
    throw err;
  }
}
