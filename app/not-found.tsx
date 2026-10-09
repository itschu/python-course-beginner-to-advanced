import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-mono text-sm text-zinc-500">404</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">Page not found</h1>
      <pre className="mx-auto mt-6 inline-block rounded-lg bg-zinc-100 px-4 py-3 text-left font-mono text-sm text-rose-700 dark:bg-zinc-900 dark:text-rose-400">
        LookupError: this page doesn&apos;t exist
      </pre>
      <div className="mt-8">
        <Link href="/learn" className="btn btn-primary">
          Back to the course
        </Link>
      </div>
    </div>
  );
}
