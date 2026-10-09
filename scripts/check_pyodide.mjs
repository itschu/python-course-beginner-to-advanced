/* Run the course content in real Pyodide (Node.js), the way the browser worker does.
 *
 * The Python validator (scripts/validate_content.py) runs everything in CPython with browser-like
 * restrictions. This script catches what it can't: packages or functions missing from Pyodide,
 * and code that is too slow in WebAssembly, including starter code that takes long to fail.
 * Like the browser, it interrupts any run after 60 seconds.
 *
 * It needs a full Pyodide distribution (the packages, not just the core), matching the version in
 * public/pyodide-worker.js. Download pyodide-<version>.tar.bz2 from
 * https://github.com/pyodide/pyodide/releases and extract it, then:
 *
 *   python3 scripts/validate_content.py --export-jobs jobs.json [--phase SLUG] [-k TEXT]
 *   PYODIDE_DIR=/path/to/pyodide node scripts/check_pyodide.mjs jobs.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_SECONDS = Number(process.env.TIMEOUT_SECONDS ?? 60);
const SLOW_SECONDS = Number(process.env.SLOW_SECONDS ?? 15);

if (isMainThread) {
  const pyodideDir = process.env.PYODIDE_DIR;
  const jobsFile = process.argv[2];
  if (!pyodideDir || !jobsFile) {
    console.error("usage: PYODIDE_DIR=/path/to/pyodide node scripts/check_pyodide.mjs jobs.json");
    process.exit(2);
  }
  const jobs = JSON.parse(readFileSync(jobsFile, "utf8"));
  const interrupt = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { pyodideDir, interrupt } });
  const send = (message) =>
    new Promise((resolve) => {
      worker.once("message", resolve);
      worker.postMessage(message);
    });

  await send({ type: "init" });
  const failures = [];
  const slow = [];
  const started = Date.now();
  for (const [i, job] of jobs.entries()) {
    Atomics.store(interrupt, 0, 0);
    // Python checks the interrupt buffer regularly and raises KeyboardInterrupt when it's set to 2 (SIGINT).
    const timer = setTimeout(() => Atomics.store(interrupt, 0, 2), TIMEOUT_SECONDS * 1000);
    const { result, seconds, output } = await send({ type: "run", job });
    clearTimeout(timer);

    const testsPassed = Array.isArray(result.tests) && result.tests.length > 0 && result.tests.every((t) => t.passed);
    const ok = {
      ok: result.ok,
      error: !result.ok,
      pass: result.ok && testsPassed,
      fail: !(result.ok && testsPassed),
    }[job.expect];
    if (!ok) {
      const detail = result.error ?? JSON.stringify((result.tests ?? []).filter((t) => !t.passed));
      const shown = output.trim() ? `\n--- output ---\n${output.trim().slice(-400)}` : "";
      failures.push(`${job.where}: expected ${job.expect}\n${String(detail).slice(0, 800)}${shown}`);
    }
    if (seconds >= TIMEOUT_SECONDS) failures.push(`${job.where}: interrupted after ${TIMEOUT_SECONDS}s, as the browser would`);
    else if (seconds > SLOW_SECONDS) slow.push(`${job.where}: ${seconds.toFixed(1)}s`);
    if ((i + 1) % 50 === 0) console.error(`  ${i + 1}/${jobs.length} jobs (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  await worker.terminate();

  console.log(`Ran ${jobs.length} jobs in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  if (slow.length) console.log(`\nSlower than ${SLOW_SECONDS}s (the browser stops runs after ${TIMEOUT_SECONDS}s):\n  ${slow.join("\n  ")}`);
  if (failures.length) {
    console.log(`\n${failures.length} problem(s):\n`);
    for (const f of failures) console.log(`✗ ${f}\n`);
    process.exit(1);
  }
  console.log("Everything behaves the same in Pyodide.");
} else {
  const { pyodideDir, interrupt } = workerData;
  const { loadPyodide } = await import(pathToFileURL(path.join(pyodideDir, "pyodide.mjs")).href);
  const pyodide = await loadPyodide({ indexURL: pyodideDir + path.sep });
  pyodide.setInterruptBuffer(interrupt);
  let output = "";
  pyodide.setStdout({ batched: (text) => { output += text + "\n"; } });
  pyodide.setStderr({ batched: (text) => { output += text + "\n"; } });
  await pyodide.runPythonAsync(readFileSync(path.join(root, "public", "pyodide-harness.py"), "utf8"));

  const loaded = new Set();
  const loadDataFiles = (source) => {
    for (const match of source.matchAll(/["'](?:\.\/)?data\/([A-Za-z0-9_.-]+)["']/g)) {
      if (loaded.has(match[1])) continue;
      pyodide.FS.mkdirTree("/home/pyodide/data");
      pyodide.FS.writeFile(`/home/pyodide/data/${match[1]}`, readFileSync(path.join(root, "public", "data", match[1])));
      loaded.add(match[1]);
    }
  };

  parentPort.on("message", async (message) => {
    if (message.type === "init") {
      parentPort.postMessage({ version: pyodide.version });
      return;
    }
    const { job } = message;
    const source = `${job.code}\n${job.tests ?? ""}`;
    await pyodide.loadPackagesFromImports(source, { messageCallback: () => {}, errorCallback: () => {} });
    loadDataFiles(source);
    output = "";
    const runner = pyodide.globals.get("_pp_run");
    const t0 = performance.now();
    let result;
    try {
      result = JSON.parse(await (job.tests == null ? runner(job.code) : runner(job.code, job.tests)));
    } catch (error) {
      result = { ok: false, error: String(error?.message ?? error), tests: null };
    }
    runner.destroy();
    parentPort.postMessage({ result, seconds: (performance.now() - t0) / 1000, output });
  });
}
