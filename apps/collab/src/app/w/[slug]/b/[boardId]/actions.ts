"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ApiError } from "@/lib/errors";
import { createCard, deleteCard, updateCard } from "@/server/card";
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

/**
 * Save edits from the card modal (title + description).
 * Redirects back to the board on success; re-renders the modal with an
 * inline error on conflict so the user can reload and merge.
 */
export async function saveCard(
  slug: string,
  boardId: string,
  cardId: string,
  formData: FormData,
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect(`/signin?callbackUrl=/w/${slug}/b/${boardId}`);

  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "");
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;
  const version = Number(formData.get("version"));

  // Due date is optional. Empty string means "clear it". We accept the
  // HTML date input's `YYYY-MM-DD` format and store the start-of-day UTC
  // instant so the same card reads as the same date in every timezone.
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  let dueDate: Date | null | undefined;
  if (dueRaw === "") {
    dueDate = null;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
    const parsed = new Date(`${dueRaw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      const qs = new URLSearchParams({
        card: cardId,
        error: "Invalid due date",
      });
      redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
    }
    dueDate = parsed;
  } else {
    const qs = new URLSearchParams({
      card: cardId,
      error: "Due date must be YYYY-MM-DD",
    });
    redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
  }

  if (!title || !Number.isInteger(version)) {
    const qs = new URLSearchParams({
      card: cardId,
      error: !title ? "Title is required" : "Missing version",
    });
    redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
  }

  try {
    await updateCard(session.user.id, cardId, {
      version,
      title,
      description,
      dueDate,
    });
    revalidatePath(`/w/${slug}/b/${boardId}`);
    redirect(`/w/${slug}/b/${boardId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "VERSION_MISMATCH") {
        const qs = new URLSearchParams({
          card: cardId,
          error:
            "Someone else edited this card. Reload to see the latest version before saving.",
        });
        redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
      }
      const qs = new URLSearchParams({
        card: cardId,
        error: err.message,
      });
      redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
    }
    throw err;
  }
}

/** Remove the card from the modal. */
export async function removeCard(
  slug: string,
  boardId: string,
  cardId: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect(`/signin?callbackUrl=/w/${slug}/b/${boardId}`);

  try {
    await deleteCard(session.user.id, cardId);
    revalidatePath(`/w/${slug}/b/${boardId}`);
    redirect(`/w/${slug}/b/${boardId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      const qs = new URLSearchParams({ card: cardId, error: err.message });
      redirect(`/w/${slug}/b/${boardId}?${qs.toString()}`);
    }
    throw err;
  }
}
