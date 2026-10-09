import type { Metadata } from "next";

import { datasets } from "@/lib/datasets";
import { Playground } from "./playground";

export const metadata: Metadata = {
  title: "Playground",
  description: "Write and run any Python code in your browser, with pandas, scikit-learn and the course datasets.",
};

export default function PlaygroundPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Playground</h1>
      <p className="mt-2 mb-6 max-w-3xl text-zinc-600 dark:text-zinc-400">
        A scratchpad for experiments. Everything runs in your browser with real Python, so nothing you do here can break
        anything.
      </p>
      <Playground datasets={datasets} />
    </div>
  );
}
