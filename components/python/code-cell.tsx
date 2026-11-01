"use client";

import { ExternalLink, Play, RotateCcw, Square } from "lucide-react";
import { useState } from "react";

import { canOpenInSnack, snackUrl } from "@/lib/mobile/snack";
import type { CodeLanguage } from "@/lib/types";

import Editor from "./editor";
import { OutputPanel } from "./output-panel";
import { useCodeRun } from "./use-code-run";

export function RunButton({
  running,
  onRun,
  onStop,
  label = "Run",
}: {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  label?: string;
}) {
  return running ? (
    <button type="button" onClick={onStop} className="btn btn-sm btn-danger">
      <Square className="size-3.5" aria-hidden /> Stop
    </button>
  ) : (
    <button type="button" onClick={onRun} className="btn btn-sm btn-primary" title="Run (Ctrl/⌘ + Enter)">
      <Play className="size-3.5" aria-hidden /> {label}
    </button>
  );
}

const CELL_LABEL: Record<CodeLanguage, string> = {
  python: "python · editable",
  rust: "rust · editable · runs on the Rust Playground",
  tsx: "react native · editable · runs in a simulator",
};

/** Opens the code in Expo Snack, where it runs on a real phone (Expo Go) or an iOS/Android preview. */
export function SnackLink({ code }: { code: string }) {
  if (!canOpenInSnack(code)) return null;
  return (
    <a href={snackUrl(code)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost" title="Run this on a real phone with Expo Snack">
      Snack <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

export function CodeCell({ code: initialCode, language = "python" }: { code: string; language?: CodeLanguage }) {
  const [code, setCode] = useState(initialCode);
  const run = useCodeRun(language);
  const execute = () => {
    if (!run.running) void run.execute(code);
  };

  return (
    <div className="my-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/80">
        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">{CELL_LABEL[language]}</span>
        <div className="flex items-center gap-1.5">
          {language === "tsx" && <SnackLink code={code} />}
          {code !== initialCode && (
            <button
              type="button"
              onClick={() => setCode(initialCode)}
              className="btn btn-sm btn-ghost"
              title="Restore the original code"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </button>
          )}
          <RunButton running={run.running} onRun={execute} onStop={run.stop} />
        </div>
      </div>
      <Editor value={code} onChange={setCode} onRun={execute} language={language} />
      <OutputPanel
        run={run}
        runnerStatus={run.runner.status}
        runnerMessage={run.runner.message}
        language={language}
        onPreviewEvent={run.dispatch}
      />
    </div>
  );
}
