/**
 * Next.js 16 renamed `middleware` to `proxy`.
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Delegates to Auth.js so unauthenticated users on protected routes
 * are redirected to `/signin`.
 */
import NextAuth from 'next-auth'
import { authConfig } from '@/auth/config'

const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  // Protect everything except signin, Auth.js internal routes, and Next.js assets.
  matcher: ['/((?!signin|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
