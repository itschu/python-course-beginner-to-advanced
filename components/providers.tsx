"use client";

import type { ReactNode } from "react";

import { ProgressProvider } from "@/components/progress/progress-provider";

export function Providers({ children }: { children: ReactNode }) {
  return <ProgressProvider>{children}</ProgressProvider>;
}
