import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export const metadata = {
  title: 'Sign in · Boardly',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  const { callbackUrl } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Boardly</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Realtime collaborative kanban for small teams.
          </p>
        </div>

        <div className="space-y-3">
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl ?? '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 transition"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <form
            action={async () => {
              'use server'
              await signIn('github', { redirectTo: callbackUrl ?? '/dashboard' })
            }}
          >
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-100 hover:bg-neutral-700 transition border border-neutral-700"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          By signing in you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.5 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.1 4-3.9 5.4l6.2 5.2C41 35.1 44 30 44 24c0-1.3-.1-2.6-.4-3.5z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.99 3.23 9.22 7.71 10.72.56.1.77-.24.77-.54v-2c-3.13.68-3.79-1.35-3.79-1.35-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.94.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.1 1.15a10.7 10.7 0 0 1 5.64 0c2.15-1.45 3.1-1.15 3.1-1.15.61 1.56.23 2.71.11 3 .72.78 1.16 1.78 1.16 3.01 0 4.32-2.64 5.28-5.15 5.55.4.35.76 1.03.76 2.07v3.06c0 .3.2.65.78.54 4.48-1.5 7.7-5.73 7.7-10.72C23.25 5.48 18.27.5 12 .5Z" />
    </svg>
  )
}
