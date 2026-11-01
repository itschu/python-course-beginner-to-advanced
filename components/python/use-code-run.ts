"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RnSession, type PreviewState } from "@/lib/mobile/rn-runner";
import type { RunResult } from "@/lib/python-runner";
import { runRust } from "@/lib/rust-runner";
import type { CodeLanguage } from "@/lib/types";
import { usePython } from "./use-python";

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface CodeRunState {
  chunks: OutputChunk[];
  result: RunResult | null;
  running: boolean;
  status?: string;
  /** True once the user has run this cell at least once. */
  touched: boolean;
  /** React Native code: the app on the phone preview, while it's running. */
  preview?: PreviewState | null;
}

const initial: CodeRunState = { chunks: [], result: null, running: false, touched: false };

/** Rust has no local runtime to load: code is sent to the Rust Playground on each run. */
const RUST_RUNNER = { status: "ready", message: "Rust runs on the Rust Playground" } as const;
/** The React Native simulator is small and starts with each run. */
const RN_RUNNER = { status: "ready", message: "React Native runs in a simulator in your browser" } as const;

function append(chunks: OutputChunk[], stream: OutputChunk["stream"], text: string): OutputChunk[] {
  const last = chunks[chunks.length - 1];
  if (last && last.stream === stream) {
    return [...chunks.slice(0, -1), { stream, text: last.text + text }];
  }
  return [...chunks, { stream, text }];
}

export function useCodeRun(language: CodeLanguage = "python") {
  const python = usePython();
  const [state, setState] = useState<CodeRunState>(initial);
  const rustAbort = useRef<AbortController | null>(null);
  const rn = useRef<RnSession | null>(null);

  useEffect(
    () => () => {
      rustAbort.current?.abort();
      rn.current?.dispose();
    },
    [],
  );

  const session = useCallback(() => {
    if (!rn.current) {
      rn.current = new RnSession({
        onPreview: (preview) => setState((s) => ({ ...s, preview })),
        onLateOutput: (stream, text) => setState((s) => ({ ...s, chunks: append(s.chunks, stream, text) })),
      });
    }
    return rn.current;
  }, []);

  const execute = useCallback(
    async (code: string, tests?: string): Promise<RunResult> => {
      setState({ chunks: [], result: null, running: true, touched: true });
      if (language === "tsx") {
        setState((s) => ({ ...s, status: tests === undefined ? "Running your app…" : "Running the tests…" }));
        const result = await session().run({
          code,
          tests,
          onStdout: (text) => setState((s) => ({ ...s, chunks: append(s.chunks, "stdout", text) })),
          onStderr: (text) => setState((s) => ({ ...s, chunks: append(s.chunks, "stderr", text) })),
        });
        setState((s) => ({ ...s, result, running: false, status: undefined }));
        return result;
      }
      if (language === "rust") {
        rustAbort.current?.abort();
        const controller = new AbortController();
        rustAbort.current = controller;
        setState((s) => ({ ...s, status: tests === undefined ? "Compiling and running on the Rust Playground…" : "Compiling and running the tests on the Rust Playground…" }));
        const { stdout, stderr, ...result } = await runRust({ code, tests, signal: controller.signal });
        if (rustAbort.current !== controller) return result;
        rustAbort.current = null;
        const chunks: OutputChunk[] = [];
        if (stderr) chunks.push({ stream: "stderr", text: stderr + "\n" });
        if (stdout) chunks.push({ stream: "stdout", text: stdout });
        setState({ chunks, result, running: false, touched: true });
        return result;
      }
      const result = await python.run({
        code,
        tests,
        onStdout: (text) => setState((s) => ({ ...s, chunks: append(s.chunks, "stdout", text) })),
        onStderr: (text) => setState((s) => ({ ...s, chunks: append(s.chunks, "stderr", text) })),
        onStatus: (status) => setState((s) => ({ ...s, status })),
      });
      setState((s) => ({ ...s, result, running: false, status: undefined }));
      return result;
    },
    [python, language, session],
  );

  const stopRust = useCallback(() => {
    rustAbort.current?.abort();
    rustAbort.current = null;
    setState((s) => ({
      ...s,
      running: false,
      status: undefined,
      result: { ok: false, error: "Stopped.", figures: [], tests: null, stopped: "user" },
    }));
  }, []);

  const stopRn = useCallback(() => rn.current?.stop(), []);

  const dispatch = useCallback((nodeId: number, event: string, args?: unknown[]) => rn.current?.dispatch(nodeId, event, args), []);

  const clear = useCallback(() => {
    rn.current?.dispose();
    rn.current = null;
    setState(initial);
  }, []);

  const runner = language === "rust" ? RUST_RUNNER : language === "tsx" ? RN_RUNNER : python;
  const stop = language === "rust" ? stopRust : language === "tsx" ? stopRn : python.stop;
  return { ...state, execute, clear, stop, dispatch, runner };
}
