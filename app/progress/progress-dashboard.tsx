"use client";

import { Download, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { ProgressBar } from "@/components/lesson/lesson-status";
import { useProgress } from "@/components/progress/progress-provider";
import type { LessonMeta } from "@/lib/types";

interface PhaseSummary {
  slug: string;
  number: number;
  title: string;
  lessons: LessonMeta[];
}

export function ProgressDashboard({ phases, account }: { phases: PhaseSummary[]; account?: ReactNode }) {
  const progress = useProgress();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data } = progress;

  const all = phases.flatMap((p) => p.lessons);
  const totalExercises = all.reduce((n, l) => n + l.exerciseIds.length, 0);
  const passedExercises = all.reduce((n, l) => n + l.exerciseIds.filter((id) => data[l.key]?.exercises[id]?.passed).length, 0);
  const completedLessons = all.filter((l) => data[l.key]?.completed).length;
  const quizzes = all.flatMap((l) => l.quizIds.map((id) => data[l.key]?.quizzes[id]).filter(Boolean));
  const quizPercent = quizzes.length
    ? Math.round((quizzes.reduce((n, q) => n + q!.best / Math.max(1, q!.total), 0) / quizzes.length) * 100)
    : 0;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pypath-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const count = progress.importData(JSON.parse(await file.text()));
      setMessage(`Imported progress for ${count} lessons and merged it with what was already here.`);
    } catch {
      setMessage("That file isn't a valid progress export.");
    }
  };

  if (!progress.hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Lessons completed" value={`${completedLessons}/${all.length}`} percent={(completedLessons / Math.max(1, all.length)) * 100} />
        <Stat label="Exercises passed" value={`${passedExercises}/${totalExercises}`} percent={(passedExercises / Math.max(1, totalExercises)) * 100} />
        <Stat label="Average best quiz score" value={quizzes.length ? `${quizPercent}%` : "–"} percent={quizPercent} />
      </div>

      {account}

      <div className="card divide-y divide-zinc-100 dark:divide-zinc-800">
        {phases.map((phase) => {
          const done = phase.lessons.filter((l) => data[l.key]?.completed).length;
          const exTotal = phase.lessons.reduce((n, l) => n + l.exerciseIds.length, 0);
          const exDone = phase.lessons.reduce((n, l) => n + l.exerciseIds.filter((id) => data[l.key]?.exercises[id]?.passed).length, 0);
          const checkpoint = phase.lessons.find((l) => l.kind === "checkpoint");
          const checkpointScores = checkpoint ? checkpoint.quizIds.map((id) => data[checkpoint.key]?.quizzes[id]).filter(Boolean) : [];
          return (
            <div key={phase.slug} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
                {phase.number}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/learn/${phase.slug}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {phase.title}
                </Link>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {done}/{phase.lessons.length} lessons · {exDone}/{exTotal} exercises
                  {checkpointScores.length > 0 &&
                    ` · checkpoint quiz best ${checkpointScores.map((q) => `${q!.best}/${q!.total}`).join(", ")}`}
                </div>
              </div>
              <div className="w-full sm:w-48">
                <ProgressBar percent={phase.lessons.length ? (done / phase.lessons.length) * 100 : 0} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Your data</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Download a backup of your progress and saved code, or move it to another browser.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline" onClick={exportData}>
            <Download className="size-4" aria-hidden /> Export progress
          </button>
          <button type="button" className="btn btn-outline" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden /> Import progress
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-ghost text-rose-700 dark:text-rose-400"
            onClick={() => {
              if (window.confirm("Delete all progress and saved code? This can't be undone.")) {
                progress.resetAll();
                setMessage("All progress deleted.");
              }
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Reset everything
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{value}</div>
      <ProgressBar percent={Math.round(percent)} className="mt-3" />
    </div>
  );
}
