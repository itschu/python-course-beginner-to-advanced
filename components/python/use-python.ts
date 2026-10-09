"use client";

import { useCallback, useSyncExternalStore } from "react";

import { getRunner, type RunnerState, type RunOptions } from "@/lib/python-runner";

const SERVER_STATE: RunnerState = { status: "idle", message: "Python not loaded yet" };

export function usePython() {
  const runner = typeof window === "undefined" ? null : getRunner();
  const state = useSyncExternalStore(
    runner ? runner.subscribe : () => () => {},
    runner ? runner.getState : () => SERVER_STATE,
    () => SERVER_STATE,
  );
  const run = useCallback((options: RunOptions) => getRunner().run(options), []);
  const stop = useCallback(() => getRunner().stop("user"), []);
  const warmup = useCallback(() => getRunner().warmup(), []);
  return { ...state, run, stop, warmup };
}
