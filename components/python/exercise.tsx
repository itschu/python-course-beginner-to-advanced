"use client";

import { CheckCircle2, Eye, FlaskConical, Lightbulb, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useProgress } from "@/components/progress/progress-provider";
import { RunButton } from "./code-cell";
import Editor from "./editor";
import { OutputPanel } from "./output-panel";
import { useCodeRun } from "./use-code-run";

interface ExerciseProps {
  lessonKey: string;
  id: string;
  title: string;
  promptHtml: string;
  starter: string;
  solution: string;
  solutionHtml: string;
  tests: string;
  hintsHtml: string[];
}

export function Exercise(props: ExerciseProps) {
  const { lessonKey, id, starter } = props;
  const progress = useProgress();
  const saved = progress.lesson(lessonKey)?.exercises[id];
  const passed = Boolean(saved?.passed);

  const [code, setCode] = useState(starter);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const run = useCodeRun();
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the learner's saved code once progress has loaded.
  useEffect(() => {
    if (!progress.hydrated || restored.current) return;
    restored.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved?.code) setCode(saved.code);
  }, [progress.hydrated, saved?.code]);

  const onChange = (value: string) => {
    setCode(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => progress.saveExerciseCode(lessonKey, id, value), 800);
  };

  const runOnly = () => {
    if (!run.running) void run.execute(code);
  };

  const check = async () => {
    if (run.running) return;
    setJustPassed(false);
    const result = await run.execute(code, props.tests);
    if (result.tests && result.tests.length > 0 && result.tests.every((t) => t.passed)) {
      progress.markExercisePassed(lessonKey, id, code);
      setJustPassed(true);
    }
  };

  const reset = () => {
    if (code !== starter && !window.confirm("Replace your code with the starter code?")) return;
    onChange(starter);
    run.clear();
  };

  return (
    <section
      id={`exercise-${id}`}
      className={`not-prose my-8 scroll-mt-24 overflow-hidden rounded-xl border-2 bg-white shadow-sm dark:bg-zinc-900 ${
        passed ? "border-emerald-500/60" : "border-blue-500/40"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">
            Exercise
          </span>
          <h3 className="m-0 text-base font-semibold text-zinc-900 dark:text-zinc-100">{props.title}</h3>
        </div>
        {passed && (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden /> Passed
          </span>
        )}
      </header>

      <div
        className="prose prose-zinc dark:prose-invert max-w-none px-4 py-3 text-[15px]"
        dangerouslySetInnerHTML={{ __html: props.promptHtml }}
      />

      <div className="border-t border-zinc-200 dark:border-zinc-800">
        <Editor value={code} onChange={onChange} onRun={check} minHeight="6rem" ariaLabel={`Code for ${props.title}`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
        <button type="button" onClick={check} disabled={run.running} className="btn btn-sm btn-success" title="Run the tests (Ctrl/⌘ + Enter)">
          <FlaskConical className="size-3.5" aria-hidden /> Check my code
        </button>
        <RunButton running={run.running} onRun={runOnly} onStop={run.stop} label="Run only" />
        {props.hintsHtml.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={hintsShown >= props.hintsHtml.length}
            onClick={() => setHintsShown((n) => n + 1)}
          >
            <Lightbulb className="size-3.5" aria-hidden /> Hint {Math.min(hintsShown + 1, props.hintsHtml.length)}/
            {props.hintsHtml.length}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            if (showSolution) return setShowSolution(false);
            if (passed || window.confirm("Looking at the answer too early hurts learning. Have you tried the hints? Show the solution anyway?")) {
              setShowSolution(true);
            }
          }}
        >
          <Eye className="size-3.5" aria-hidden /> {showSolution ? "Hide solution" : "Solution"}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowTests((v) => !v)}>
          {showTests ? "Hide tests" : "View tests"}
        </button>
        <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={reset} title="Start again from the starter code">
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      </div>

      <OutputPanel
        run={run}
        runnerStatus={run.runner.status}
        runnerMessage={run.runner.message}
        emptyHint="Write your code, then press “Check my code” to run the tests."
      />

      {justPassed && (
        <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Exercise complete. Your progress is saved. Compare your code with the solution: there is usually more than one good answer.
        </div>
      )}

      {hintsShown > 0 && (
        <div className="space-y-2 border-t border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          {props.hintsHtml.slice(0, hintsShown).map((hint, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: hint }} />
            </div>
          ))}
        </div>
      )}

      {showTests && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            These tests run after your code. Each <code>test_</code> function checks one thing. Reading tests is a
            professional skill too.
          </p>
          <pre className="m-0 overflow-x-auto rounded-lg bg-zinc-100 p-3 font-mono text-xs dark:bg-zinc-950">{props.tests}</pre>
        </div>
      )}

      {showSolution && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">One possible solution</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                if (window.confirm("Replace your code with the solution?")) onChange(props.solution);
              }}
            >
              Copy into editor
            </button>
          </div>
          <div className="code-block text-sm" dangerouslySetInnerHTML={{ __html: props.solutionHtml }} />
        </div>
      )}
    </section>
  );
}
