import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { markAllRead } from "@/server/notification";

export const POST = handle(async () => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  const count = await markAllRead(session.user.id);
  return json({ count });
});
