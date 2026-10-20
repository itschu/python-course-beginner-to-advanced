"use client";

import { Lock, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ElectiveAccess } from "@/lib/electives";

async function setEnrolled(slug: string, enrolled: boolean) {
  const response = await fetch("/api/electives", {
    method: enrolled ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
}

function useEnrol(slug: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (enrolled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setEnrolled(slug, enrolled);
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/**
 * The call to action on a locked elective page (signed out, or signed in but not taking it).
 * `returnTo` is where signing in should come back to.
 */
export function ElectiveLockedPanel({
  slug,
  title,
  access,
  returnTo,
}: {
  slug: string;
  title: string;
  access: Exclude<ElectiveAccess, "open" | "enrolled">;
  returnTo: string;
}) {
  const { busy, error, run } = useEnrol(slug);
  return (
    <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <Lock className="size-5" aria-hidden />
      </span>
      <div className="flex-1">
        {access === "signed-out" ? (
          <>
            <h2 className="m-0 font-semibold text-zinc-900 dark:text-white">Sign in to take this elective</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {title} is an optional elective for signed-in learners. It&apos;s free: create an account or sign in, then
              choose to take it. Your progress is saved to your account.
            </p>
            <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="btn btn-primary mt-4">
              Sign in or create an account
            </Link>
          </>
        ) : (
          <>
            <h2 className="m-0 font-semibold text-zinc-900 dark:text-white">This elective is optional</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              It isn&apos;t part of the main course and doesn&apos;t count towards it. Take it if it interests you; you
              can leave it at any time and your progress is kept.
            </p>
            <button type="button" className="btn btn-primary mt-4" disabled={busy} onClick={() => run(true)}>
              <Sparkles className="size-4" aria-hidden /> {busy ? "Adding…" : "Take this elective"}
            </button>
          </>
        )}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

/** Shown to learners taking the elective. */
export function LeaveElectiveButton({ slug }: { slug: string }) {
  const { busy, error, run } = useEnrol(slug);
  return (
    <div>
      <button
        type="button"
        className="btn btn-sm btn-ghost text-zinc-600 dark:text-zinc-400"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Leave this elective? Your progress is kept, and you can take it again later.")) run(false);
        }}
      >
        <LogOut className="size-4" aria-hidden /> {busy ? "Leaving…" : "Leave elective"}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
