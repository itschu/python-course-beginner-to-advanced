"use client";

export interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  error: string | null;
}

export interface RunResult {
  ok: boolean;
  error: string | null;
  figures: string[];
  tests: TestResult[] | null;
  duration?: number;
  stopped?: "timeout" | "user";
}

export interface RunOptions {
  code: string;
  tests?: string;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onStatus?: (message: string) => void;
  timeoutMs?: number;
}

export type RunnerStatus = "idle" | "loading" | "ready" | "running" | "error";

export interface RunnerState {
  status: RunnerStatus;
  message: string;
  python?: string;
}

interface ActiveRun {
  id: number;
  options: RunOptions;
  resolve: (result: RunResult) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT = 60_000;
const INDEX_URL = process.env.NEXT_PUBLIC_PYODIDE_INDEX_URL;

/**
 * One shared Python worker per browser tab. Runs are queued and executed one
 * at a time; stopping a run terminates the worker and a fresh one is created
 * on the next run.
 */
class PythonRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private active: ActiveRun | null = null;
  private waiting: ActiveRun[] = [];
  private listeners = new Set<() => void>();
  private state: RunnerState = { status: "idle", message: "Python not loaded yet" };
  private ready = false;

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<RunnerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const url = INDEX_URL
      ? `/pyodide-worker.js?indexURL=${encodeURIComponent(INDEX_URL)}`
      : "/pyodide-worker.js";
    const worker = new Worker(url, { type: "module" });
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      this.setState({ status: "error", message: event.message || "Python worker crashed" });
    };
    this.worker = worker;
    this.ready = false;
    this.setState({ status: "loading", message: "Loading Python…" });
    worker.postMessage({ type: "init" });
    return worker;
  }

  /** Start downloading Python in the background so the first run is fast. */
  warmup() {
    this.ensureWorker();
  }

  run(options: RunOptions): Promise<RunResult> {
    return new Promise((resolve) => {
      const job: ActiveRun = { id: this.nextId++, options, resolve };
      this.waiting.push(job);
      this.pump();
    });
  }

  private pump() {
    if (this.active || this.waiting.length === 0) return;
    const job = this.waiting.shift()!;
    this.active = job;
    const worker = this.ensureWorker();
    if (this.ready) this.setState({ status: "running", message: "Running…" });
    worker.postMessage({ type: "run", id: job.id, code: job.options.code, tests: job.options.tests });
  }

  private finish(result: RunResult) {
    const job = this.active;
    if (!job) return;
    if (job.timer) clearTimeout(job.timer);
    this.active = null;
    job.resolve(result);
    if (this.ready) this.setState({ status: "ready", message: "Python ready" });
    this.pump();
  }

  /** Stop the current run (and anything queued) by terminating the worker. */
  stop(reason: "timeout" | "user" = "user") {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    const message =
      reason === "timeout"
        ? `Your code ran for more than ${Math.round((this.active?.options.timeoutMs ?? DEFAULT_TIMEOUT) / 1000)} seconds and was stopped. Look for a loop that never ends.`
        : "Stopped. Python will restart on your next run.";
    const stopped: RunResult = { ok: false, error: message, figures: [], tests: null, stopped: reason };
    const queued = this.waiting;
    this.waiting = [];
    this.finish(stopped);
    queued.forEach((job) => job.resolve(stopped));
    this.setState({ status: "idle", message: "Python stopped" });
  }

  private handleMessage(msg: {
    type: string;
    id?: number;
    text?: string;
    message?: string;
    python?: string;
    result?: RunResult;
  }) {
    const job = this.active;
    switch (msg.type) {
      case "status":
        if (!this.ready) this.setState({ status: "loading", message: msg.message ?? "Loading…" });
        job?.options.onStatus?.(msg.message ?? "");
        break;
      case "ready":
        this.ready = true;
        this.setState({
          status: job ? "running" : "ready",
          message: job ? "Running…" : "Python ready",
          python: msg.python,
        });
        break;
      case "fatal":
        this.setState({ status: "error", message: msg.message ?? "Python failed to load" });
        break;
      case "started":
        if (job && job.id === msg.id) {
          this.setState({ status: "running", message: "Running…" });
          const timeout = job.options.timeoutMs ?? DEFAULT_TIMEOUT;
          job.timer = setTimeout(() => this.stop("timeout"), timeout);
        }
        break;
      case "stdout":
        if (job && job.id === msg.id) job.options.onStdout?.(msg.text ?? "");
        break;
      case "stderr":
        if (job && job.id === msg.id) job.options.onStderr?.(msg.text ?? "");
        break;
      case "result":
        if (job && job.id === msg.id && msg.result) this.finish(msg.result);
        break;
    }
  }
}

let runner: PythonRunner | null = null;

export function getRunner(): PythonRunner {
  if (!runner) runner = new PythonRunner();
  return runner;
}
