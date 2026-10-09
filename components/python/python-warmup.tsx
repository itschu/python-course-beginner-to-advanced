"use client";

import { useEffect } from "react";

import { getRunner } from "@/lib/python-runner";

/** Starts downloading Python shortly after the page loads, so the first Run is quick. */
export function PythonWarmup({ delayMs = 2500 }: { delayMs?: number }) {
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    const timer = setTimeout(() => getRunner().warmup(), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return null;
}
