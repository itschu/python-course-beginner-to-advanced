"use client";

import type { RunResult } from "@/lib/python-runner";

/** A host component in the phone preview, as serialized by lib/mobile/rn-runtime.mjs. */
export interface PreviewNode {
  id: number;
  type?: string;
  text?: string;
  props?: Record<string, unknown> & { style?: Record<string, unknown> };
  events?: string[];
  children?: PreviewNode[];
}

export interface PreviewState {
  tree: PreviewNode[];
  error: string | null;
  /** Increments with every new tree, so inputs can resync with the app's state. */
  version: number;
}

const RUN_TIMEOUT_MS = 10_000;
const EVENT_TIMEOUT_MS = 5_000;

interface PendingRun {
  id: number;
  resolve: (result: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

/**
 * One simulator per code cell or exercise. The app keeps running in the worker after a run,
 * so the learner can tap buttons and type in the phone preview; each run starts it afresh.
 */
export class RnSession {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: PendingRun | null = null;
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  constructor(
    private readonly handlers: {
      onPreview: (preview: PreviewState | null) => void;
      /** Output printed after the run finished (from taps, timers, effects). */
      onLateOutput: (stream: "stdout" | "stderr", text: string) => void;
    },
  ) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./rn-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      this.finish({ ok: false, error: `The simulator crashed: ${event.message || "unknown error"}`, figures: [], tests: null });
    };
    this.worker = worker;
    return worker;
  }

  run(options: { code: string; tests?: string; onStdout?: (text: string) => void; onStderr?: (text: string) => void }): Promise<RunResult> {
    this.cancelPending("Stopped: a new run started.");
    this.handlers.onPreview(null);
    return new Promise((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(() => this.kill("timeout"), RUN_TIMEOUT_MS);
      this.pending = { id, resolve, timer, onStdout: options.onStdout, onStderr: options.onStderr };
      this.ensureWorker().postMessage({ type: "run", id, code: options.code, tests: options.tests });
    });
  }

  /** Forward a tap or keystroke from the phone preview to the app. */
  dispatch(nodeId: number, event: string, args: unknown[] = []) {
    if (!this.worker) return;
    this.worker.postMessage({ type: "event", nodeId, event, args });
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => this.kill("frozen"), EVENT_TIMEOUT_MS);
  }

  stop() {
    this.kill("user");
  }

  dispose() {
    this.cancelPending("Stopped.");
    this.worker?.terminate();
    this.worker = null;
  }

  private cancelPending(message: string) {
    if (!this.pending) return;
    const { resolve, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    resolve({ ok: false, error: message, figures: [], tests: null, stopped: "user" });
  }

  private kill(reason: "timeout" | "user" | "frozen") {
    this.worker?.terminate();
    this.worker = null;
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = null;
    const messages = {
      timeout: `Your code ran for more than ${RUN_TIMEOUT_MS / 1000} seconds and was stopped. Look for a loop that never ends.`,
      user: "Stopped.",
      frozen: `The app stopped responding for ${EVENT_TIMEOUT_MS / 1000} seconds after that tap, so it was stopped. Look for a loop that never ends in your event handler. Run the code again to restart it.`,
    };
    if (this.pending) {
      this.finish({ ok: false, error: messages[reason], figures: [], tests: null, stopped: reason === "user" ? "user" : "timeout" });
    } else if (reason !== "user") {
      this.handlers.onPreview({ tree: [], error: messages[reason], version: ++this.version });
    } else {
      this.handlers.onPreview(null);
    }
  }

  private finish(result: RunResult) {
    const job = this.pending;
    if (!job) return;
    clearTimeout(job.timer);
    this.pending = null;
    job.resolve(result);
  }

  private handleMessage(msg: { type: string; id: number; text?: string; result?: RunResult; tree?: PreviewNode[]; error?: string | null }) {
    const job = this.pending;
    switch (msg.type) {
      case "stdout":
      case "stderr": {
        const text = msg.text ?? "";
        if (job && job.id === msg.id) (msg.type === "stdout" ? job.onStdout : job.onStderr)?.(text);
        else this.handlers.onLateOutput(msg.type, text);
        break;
      }
      case "tree":
        if (this.eventTimer) clearTimeout(this.eventTimer);
        this.eventTimer = null;
        this.handlers.onPreview({ tree: msg.tree ?? [], error: msg.error ?? null, version: ++this.version });
        break;
      case "result":
        if (job && job.id === msg.id && msg.result) this.finish(msg.result);
        break;
    }
  }
}
