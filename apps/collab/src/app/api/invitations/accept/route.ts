import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { acceptInvitation } from "@/server/invitation";

export const POST = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) throw new UnauthorizedError();

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    throw new BadRequestError("Missing token", {
      fieldErrors: { token: "required" },
    });
  }

  const result = await acceptInvitation(
    session.user.id,
    session.user.email,
    token,
  );
  return json(result);
});
