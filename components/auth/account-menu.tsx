"use client";

import { Cloud, CloudOff, LogOut, RefreshCw, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useProgress } from "@/components/progress/progress-provider";
import { useAuth } from "@/components/providers";

export function SyncBadge() {
  const { syncState } = useProgress();
  if (syncState === "syncing")
    return (
      <span className="flex items-center gap-1 text-xs text-zinc-500">
        <RefreshCw className="size-3 animate-spin" aria-hidden /> Saving…
      </span>
    );
  if (syncState === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-rose-600">
        <CloudOff className="size-3" aria-hidden /> Not synced
      </span>
    );
  if (syncState === "synced")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <Cloud className="size-3" aria-hidden /> Synced
      </span>
    );
  return null;
}

export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!auth.enabled || auth.loading) return null;

  if (!auth.user) {
    return (
      <Link href="/login" className="btn btn-sm btn-outline">
        Sign in
      </Link>
    );
  }

  const initial = (auth.user.name || auth.user.email).trim().charAt(0).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-0.5 pr-1 pl-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <SyncBadge />
        <span className="flex size-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {initial || <User className="size-4" />}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-white">{auth.user.name}</div>
            <div className="truncate text-xs text-zinc-500">{auth.user.email}</div>
          </div>
          <Link
            href="/progress"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            My progress
          </Link>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await auth.signOut();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
