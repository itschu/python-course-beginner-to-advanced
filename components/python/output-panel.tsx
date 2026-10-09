"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { RunnerStatus, TestResult } from "@/lib/python-runner";
import type { CodeRunState } from "./use-code-run";

interface OutputPanelProps {
  run: CodeRunState;
  runnerStatus: RunnerStatus;
  runnerMessage: string;
  emptyHint?: string;
}

export function OutputPanel({ run, runnerStatus, runnerMessage, emptyHint }: OutputPanelProps) {
  if (!run.touched) {
    return emptyHint ? (
      <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyHint}
      </div>
    ) : null;
  }

  const { result } = run;
  const hasOutput = run.chunks.some((c) => c.text.length > 0);

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
      {run.running && (
        <div className="flex items-center gap-2 px-4 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {runnerStatus === "loading"
            ? `${runnerMessage} The first run downloads Python, so it takes a few seconds.`
            : (run.status ?? "Running…")}
        </div>
      )}
      {hasOutput && (
        <pre className="m-0 max-h-96 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
          {run.chunks.map((chunk, i) => (
            <span
              key={i}
              className={chunk.stream === "stderr" ? "text-amber-700 dark:text-amber-400" : undefined}
            >
              {chunk.text}
            </span>
          ))}
        </pre>
      )}
      {result?.error && (
        <pre
          role="alert"
          className="m-0 overflow-auto border-t border-rose-200 bg-rose-50 px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {result.error}
        </pre>
      )}
      {result?.figures.map((png, i) => (
        <div key={i} className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${png}`}
            alt={`Chart ${i + 1} drawn by your code`}
            className="mx-auto h-auto max-w-full"
          />
        </div>
      ))}
      {result?.tests && <TestResults tests={result.tests} />}
      {result && !run.running && !hasOutput && !result.error && result.figures.length === 0 && !result.tests && (
        <p className="m-0 px-4 py-3 text-xs text-zinc-500 italic dark:text-zinc-400">
          Your code ran without printing anything. Use print() to see values.
        </p>
      )}
      {result?.duration !== undefined && (
        <div className="px-4 pb-2 text-right text-[11px] text-zinc-400">ran in {result.duration} ms</div>
      )}
    </div>
  );
}

function TestResults({ tests }: { tests: TestResult[] }) {
  const passed = tests.filter((t) => t.passed).length;
  const all = passed === tests.length;
  return (
    <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div
        className={`mb-2 text-sm font-semibold ${all ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-200"}`}
      >
        {all ? `All ${tests.length} tests passed. Nice work!` : `${passed} of ${tests.length} tests passed`}
      </div>
      <ul className="m-0 list-none space-y-1.5 p-0">
        {tests.map((t) => (
          <li key={t.name} className="flex gap-2">
            {t.passed ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="passed" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-label="failed" />
            )}
            <div className="min-w-0">
              <div className="text-zinc-800 dark:text-zinc-200">{t.description}</div>
              {!t.passed && t.error && (
                <pre className="m-0 mt-1 overflow-x-auto rounded bg-rose-50 px-2 py-1 font-mono text-xs whitespace-pre-wrap text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                  {t.error}
                </pre>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
