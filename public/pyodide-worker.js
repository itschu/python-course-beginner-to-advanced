/* Module worker: create with new Worker(url, { type: "module" }).
 * Runs learner code with Pyodide (Python compiled to WebAssembly) inside a Web Worker,
 * so a slow or infinite loop never freezes the page. The main thread can always
 * terminate this worker to stop a run.
 *
 * Messages in:  { type: "init" } | { type: "run", id, code, tests }
 * Messages out: { type: "status", message } | { type: "ready", python, pyodide }
 *               { type: "started", id } | { type: "stdout" | "stderr", id, text }
 *               { type: "result", id, result } | { type: "fatal", message }
 */
const params = new URL(self.location.href).searchParams;
const INDEX_URL = params.get("indexURL") || "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const OUTPUT_LIMIT = 1_000_000;

let pyodide = null;
let initPromise = null;
let queue = Promise.resolve();
let currentId = null;
let outputChars = 0;
let lastFlush = 0;
const pending = { stdout: "", stderr: "" };
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
const loadedFiles = new Set();

function post(message) {
  self.postMessage(message);
}

function flushOutput() {
  lastFlush = Date.now();
  for (const stream of ["stdout", "stderr"]) {
    if (pending[stream]) {
      post({ type: stream, id: currentId, text: pending[stream] });
      pending[stream] = "";
    }
  }
}

function writeOutput(stream, bytes) {
  if (currentId === null) return bytes.length;
  const text = decoders[stream].decode(bytes, { stream: true });
  if (outputChars <= OUTPUT_LIMIT) {
    outputChars += text.length;
    pending[stream] += text;
    if (outputChars > OUTPUT_LIMIT) {
      pending[stream] += "\n[Output truncated after 1,000,000 characters]\n";
    }
  }
  // Python runs synchronously, so timers can't fire mid-run. Flush on a time budget instead.
  if (Date.now() - lastFlush > 60) flushOutput();
  return bytes.length;
}


async function init() {
  post({ type: "status", message: "Downloading Python…" });
  const { loadPyodide } = await import(`${INDEX_URL}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: INDEX_URL });
  pyodide.setStdout({ write: (bytes) => writeOutput("stdout", bytes) });
  pyodide.setStderr({ write: (bytes) => writeOutput("stderr", bytes) });
  const harness = await fetch(new URL("pyodide-harness.py", self.location.href));
  await pyodide.runPythonAsync(await harness.text());
  const python = pyodide.runPython("import sys; sys.version.split()[0]");
  post({ type: "ready", python, pyodide: pyodide.version });
}

function ensureInit() {
  if (!initPromise) {
    initPromise = init().catch((error) => {
      post({ type: "fatal", message: `Python failed to load: ${error?.message ?? error}` });
      throw error;
    });
  }
  return initPromise;
}

async function loadDataFiles(source) {
  const names = new Set();
  for (const match of source.matchAll(/["'](?:\.\/)?data\/([A-Za-z0-9_.-]+)["']/g)) {
    names.add(match[1]);
  }
  for (const name of names) {
    if (loadedFiles.has(name)) continue;
    const response = await fetch(new URL(`data/${name}`, self.location.href));
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    pyodide.FS.mkdirTree("/home/pyodide/data");
    pyodide.FS.writeFile(`/home/pyodide/data/${name}`, bytes);
    loadedFiles.add(name);
  }
}

async function run({ id, code, tests }) {
  try {
    await ensureInit();
  } catch {
    post({ type: "result", id, result: { ok: false, error: "Python could not be loaded. Check your connection and reload the page.", figures: [], tests: null } });
    return;
  }
  currentId = id;
  outputChars = 0;
  try {
    const source = `${code}\n${tests ?? ""}`;
    await pyodide.loadPackagesFromImports(source, {
      messageCallback: (message) => {
        if (/^Loading /.test(message)) post({ type: "status", message });
      },
      errorCallback: () => {},
    });
    await loadDataFiles(source);
    post({ type: "started", id });
    const runner = pyodide.globals.get("_pp_run");
    // JS null becomes JsNull (not None) in Python, so omit the argument instead.
    const json = await (tests == null ? runner(code) : runner(code, tests));
    runner.destroy();
    flushOutput();
    post({ type: "result", id, result: JSON.parse(json) });
  } catch (error) {
    flushOutput();
    post({ type: "result", id, result: { ok: false, error: String(error?.message ?? error), figures: [], tests: null } });
  } finally {
    currentId = null;
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    queue = queue.then(() => ensureInit()).catch(() => {});
  } else if (message.type === "run") {
    queue = queue.then(() => run(message));
  }
};
