"use client";

import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useState } from "react";

import { useProgress } from "@/components/progress/progress-provider";
import type { QuizQuestion } from "@/lib/types";

interface QuizProps {
  lessonKey: string;
  id: string;
  title: string;
  questions: QuizQuestion[];
}

function isCorrect(question: QuizQuestion, chosen: Set<number>): boolean {
  return question.options.every((o, i) => o.correct === chosen.has(i));
}

export function Quiz({ lessonKey, id, title, questions }: QuizProps) {
  const progress = useProgress();
  const best = progress.lesson(lessonKey)?.quizzes[id];
  const [answers, setAnswers] = useState<Set<number>[]>(() => questions.map(() => new Set()));
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = answers.every((a) => a.size > 0);
  const score = questions.filter((q, i) => isCorrect(q, answers[i])).length;

  const choose = (qi: number, oi: number) => {
    if (submitted) return;
    setAnswers((prev) =>
      prev.map((set, i) => {
        if (i !== qi) return set;
        if (!questions[qi].multiple) return new Set([oi]);
        const next = new Set(set);
        if (next.has(oi)) next.delete(oi);
        else next.add(oi);
        return next;
      }),
    );
  };

  const submit = () => {
    setSubmitted(true);
    progress.recordQuiz(lessonKey, id, score, questions.length);
  };

  const retry = () => {
    setAnswers(questions.map(() => new Set()));
    setSubmitted(false);
  };

  return (
    <section
      id={`quiz-${id}`}
      className="my-8 scroll-mt-24 rounded-xl border border-violet-300/70 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="size-5 text-violet-600 dark:text-violet-400" aria-hidden />
          <h3 className="m-0 text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        </div>
        {best && (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Best score: {best.best}/{best.total}
          </span>
        )}
      </header>

      <ol className="m-0 list-none space-y-5 p-0">
        {questions.map((q, qi) => {
          const correct = isCorrect(q, answers[qi]);
          return (
            <li key={qi}>
              <div className="flex gap-2">
                <span className="font-semibold text-violet-700 dark:text-violet-300">{qi + 1}.</span>
                <div
                  className="prose prose-zinc dark:prose-invert prose-p:my-0 max-w-none text-[15px] font-medium"
                  dangerouslySetInnerHTML={{ __html: q.promptHtml }}
                />
              </div>
              {q.multiple && (
                <p className="mt-1 ml-6 text-xs text-zinc-500 dark:text-zinc-400">Choose all that apply.</p>
              )}
              <div className="mt-2 ml-6 space-y-1.5" role={q.multiple ? "group" : "radiogroup"}>
                {q.options.map((o, oi) => {
                  const chosen = answers[qi].has(oi);
                  let tone =
                    "border-zinc-200 bg-white hover:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";
                  if (chosen && !submitted) tone = "border-violet-500 bg-violet-100 dark:bg-violet-900/40";
                  if (submitted && o.correct)
                    tone = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40";
                  if (submitted && chosen && !o.correct) tone = "border-rose-500 bg-rose-50 dark:bg-rose-950/40";
                  return (
                    <button
                      key={oi}
                      type="button"
                      role={q.multiple ? "checkbox" : "radio"}
                      aria-checked={chosen}
                      onClick={() => choose(qi, oi)}
                      disabled={submitted}
                      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${tone}`}
                    >
                      <span
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border ${
                          q.multiple ? "rounded" : "rounded-full"
                        } ${chosen ? "border-violet-600 bg-violet-600" : "border-zinc-400"}`}
                        aria-hidden
                      >
                        {chosen && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="quiz-option min-w-0" dangerouslySetInnerHTML={{ __html: o.html }} />
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <div
                  className={`mt-2 ml-6 flex gap-2 rounded-lg px-3 py-2 text-sm ${
                    correct
                      ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                      : "bg-rose-100/70 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
                  }`}
                >
                  {correct ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <div
                    className="prose prose-sm dark:prose-invert prose-p:my-0 max-w-none text-inherit"
                    dangerouslySetInnerHTML={{ __html: q.explanationHtml || (correct ? "Correct." : "Not quite.") }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex items-center gap-3">
        {!submitted ? (
          <button type="button" className="btn btn-primary" disabled={!allAnswered} onClick={submit}>
            Check answers
          </button>
        ) : (
          <>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              You scored {score}/{questions.length}
              {score === questions.length ? ". Perfect!" : ""}
            </span>
            <button type="button" className="btn btn-ghost" onClick={retry}>
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
