import Link from "next/link";

export const metadata = {
  title: "Not found · Boardly",
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold tracking-tight text-indigo-400">404</p>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-400">
          The page you are looking for has moved, been deleted, or never
          existed.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
