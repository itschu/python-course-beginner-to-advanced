/// <reference lib="webworker" />
/**
 * Runs React Native code from the mobile course in a Web Worker, so a slow or infinite loop
 * never freezes the page (lib/mobile/rn-runner.ts terminates the worker to stop a run).
 *
 * Messages in:  { type: "run", id, code, tests? } | { type: "event", nodeId, event, args }
 * Messages out: { type: "stdout" | "stderr", id, text } | { type: "result", id, result }
 *               { type: "tree", id, tree, error }
 */
import { transform } from "sucrase";

import { runCode } from "./rn-runtime.mjs";

type App = NonNullable<Awaited<ReturnType<typeof runCode>>["app"]>;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const OUTPUT_LIMIT = 200_000;

let app: App | null = null;
let unsubscribe: (() => void) | null = null;
let currentId = 0;
let outputChars = 0;

function postTree() {
  if (!app) return;
  scope.postMessage({ type: "tree", id: currentId, tree: app.tree(), error: app.error() });
}

function log(stream: string, text: string) {
  if (outputChars > OUTPUT_LIMIT) return;
  outputChars += text.length;
  if (outputChars > OUTPUT_LIMIT) text += "\n[Output truncated]\n";
  scope.postMessage({ type: stream, id: currentId, text });
}

scope.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type === "run") {
    unsubscribe?.();
    app?.dispose();
    app = null;
    currentId = msg.id;
    outputChars = 0;
    const result = await runCode({ code: msg.code, tests: msg.tests, transform, log });
    if (result.app) {
      app = result.app;
      unsubscribe = app.subscribe(postTree);
      postTree();
    }
    scope.postMessage({
      type: "result",
      id: msg.id,
      result: { ok: result.ok, error: result.error, tests: result.tests, figures: [], duration: result.duration },
    });
  } else if (msg.type === "event") {
    if (!app || !app.dispatch(msg.nodeId, msg.event, msg.args ?? [])) postTree();
  }
};
