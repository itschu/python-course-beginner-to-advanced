"use client";

import { Cloud, HardDrive } from "lucide-react";
import Link from "next/link";

import { SyncBadge } from "@/components/auth/account-menu";
import { useAuth } from "@/components/providers";

export function AccountCard() {
  const auth = useAuth();
  if (auth.loading) return null;

  if (auth.user) {
    return (
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <Cloud className="size-6 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-zinc-900 dark:text-white">Synced to your account</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {auth.user.email}. Your progress and code follow you to any device.
          </div>
        </div>
        <SyncBadge />
      </div>
    );
  }

  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <HardDrive className="size-6 text-zinc-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-zinc-900 dark:text-white">Saved in this browser only</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {auth.enabled
            ? "Sign in to back up your progress and continue on other devices. What you've done so far will be added to your account."
            : "Clearing your browser data would erase it, so export a backup now and then."}
        </div>
      </div>
      {auth.enabled && (
        <Link href="/login?next=/progress" className="btn btn-primary">
          Sign in to sync
        </Link>
      )}
    </div>
  );
}
