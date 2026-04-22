import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Root route acts as a gate:
 *   - authenticated   -> /dashboard
 *   - unauthenticated -> /signin
 */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/signin");
}
