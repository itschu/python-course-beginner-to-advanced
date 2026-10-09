"use client";

import { useCallback, useState } from "react";

import type { RunResult } from "@/lib/python-runner";
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
}

const initial: CodeRunState = { chunks: [], result: null, running: false, touched: false };

function append(chunks: OutputChunk[], stream: OutputChunk["stream"], text: string): OutputChunk[] {
  const last = chunks[chunks.length - 1];
  if (last && last.stream === stream) {
    return [...chunks.slice(0, -1), { stream, text: last.text + text }];
  }
  return [...chunks, { stream, text }];
}

export function useCodeRun() {
  const python = usePython();
  const [state, setState] = useState<CodeRunState>(initial);

  const execute = useCallback(
    async (code: string, tests?: string): Promise<RunResult> => {
      setState({ chunks: [], result: null, running: true, touched: true });
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
    [python],
  );

  const clear = useCallback(() => setState(initial), []);

  return { ...state, execute, clear, stop: python.stop, runner: python };
}
