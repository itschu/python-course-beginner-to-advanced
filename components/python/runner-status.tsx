"use client";

import { usePython } from "./use-python";

const DOT: Record<string, string> = {
  idle: "bg-zinc-300 dark:bg-zinc-600",
  loading: "bg-amber-400 animate-pulse",
  ready: "bg-emerald-500",
  running: "bg-blue-500 animate-pulse",
  error: "bg-rose-500",
};

/** Small indicator showing whether the in-browser Python is loaded. */
export function RunnerStatus() {
  const { status, message, python } = usePython();
  const label = status === "ready" && python ? `Python ${python} ready` : message;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400" title={message}>
      <span className={`size-2 rounded-full ${DOT[status]}`} aria-hidden />
      {label}
    </span>
  );
}
