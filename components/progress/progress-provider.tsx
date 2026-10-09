"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  emptyLesson,
  mergeProgress,
  sanitizeProgress,
  type LessonProgress,
  type ProgressData,
} from "@/lib/progress";

const STORAGE_KEY = "pypath-progress-v1";

export type SyncState = "local" | "syncing" | "synced" | "error";

interface ProgressContextValue {
  data: ProgressData;
  hydrated: boolean;
  syncState: SyncState;
  lesson: (key: string) => LessonProgress | undefined;
  saveExerciseCode: (lessonKey: string, exerciseId: string, code: string) => void;
  markExercisePassed: (lessonKey: string, exerciseId: string, code: string) => void;
  recordQuiz: (lessonKey: string, quizId: string, score: number, total: number) => void;
  setLessonCompleted: (lessonKey: string, completed: boolean) => void;
  importData: (data: unknown) => number;
  resetAll: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

interface StoredProgress {
  /** Account the data belongs to; null for guest progress (not signed in). */
  owner: string | null;
  lessons: ProgressData;
}

function readLocal(): StoredProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { owner: null, lessons: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "lessons" in parsed && "owner" in parsed) {
      return {
        owner: typeof parsed.owner === "string" ? parsed.owner : null,
        lessons: sanitizeProgress(parsed.lessons),
      };
    }
    return { owner: null, lessons: sanitizeProgress(parsed) };
  } catch {
    return { owner: null, lessons: {} };
  }
}

function writeLocal(stored: StoredProgress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be full or blocked (private mode). Progress still works for this visit.
  }
}

export interface RemoteSync {
  /** The signed-in account. */
  userId: string;
  /** Load everything saved on the server for the signed-in user. */
  pull: () => Promise<ProgressData>;
  /** Save these lessons on the server. */
  push: (lessons: ProgressData) => Promise<void>;
  /** Delete all server-side progress. */
  clear: () => Promise<void>;
}

export function ProgressProvider({
  children,
  remote,
}: {
  children: ReactNode;
  /** Present when the learner is signed in; progress is then synced to the database. */
  remote?: RemoteSync | null;
}) {
  const [data, setData] = useState<ProgressData>({});
  const [owner, setOwner] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("local");
  const dirty = useRef(new Set<string>());
  const dataRef = useRef(data);
  const ownerRef = useRef(owner);
  const previousUser = useRef<string | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dataRef.current = data;
    ownerRef.current = owner;
  }, [data, owner]);

  useEffect(() => {
    // Hydrate from localStorage once on mount (it isn't available during server rendering).
    const stored = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(stored.lessons);
    setOwner(stored.owner);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeLocal({ owner, lessons: data });
  }, [data, owner, hydrated]);

  const flush = useCallback(async () => {
    if (!remote || dirty.current.size === 0) return;
    const keys = [...dirty.current];
    dirty.current.clear();
    const lessons: ProgressData = {};
    for (const key of keys) {
      if (dataRef.current[key]) lessons[key] = dataRef.current[key];
    }
    setSyncState("syncing");
    try {
      await remote.push(lessons);
      setSyncState("synced");
    } catch {
      keys.forEach((k) => dirty.current.add(k));
      setSyncState("error");
    }
  }, [remote]);

  const scheduleFlush = useCallback(() => {
    if (!remote) return;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 1500);
  }, [remote, flush]);

  // Signing in merges this browser's progress into the account (only guest progress or the
  // same account's: never another person's). Signing out removes it from this browser.
  useEffect(() => {
    if (!hydrated) return;
    if (!remote) {
      if (previousUser.current) {
        previousUser.current = null;
        dirty.current.clear();
        setData({});
        setOwner(null);
      }
      return;
    }
    previousUser.current = remote.userId;
    let cancelled = false;
    // Syncing with the server (an external system) is exactly what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncState("syncing");
    remote
      .pull()
      .then(async (server) => {
        if (cancelled) return;
        const included = [...dirty.current];
        const local = ownerRef.current === null || ownerRef.current === remote.userId ? dataRef.current : {};
        const merged = mergeProgress(server, local);
        setData(merged);
        setOwner(remote.userId);
        const changed: ProgressData = {};
        for (const [key, lesson] of Object.entries(merged)) {
          if (JSON.stringify(server[key]) !== JSON.stringify(lesson)) changed[key] = lesson;
        }
        if (Object.keys(changed).length > 0) await remote.push(changed);
        included.forEach((key) => dirty.current.delete(key));
        if (!cancelled) setSyncState("synced");
      })
      .catch(() => !cancelled && setSyncState("error"));
    return () => {
      cancelled = true;
    };
  }, [hydrated, remote]);

  // Save pending changes when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const update = useCallback(
    (lessonKey: string, fn: (lesson: LessonProgress, now: string) => LessonProgress) => {
      setData((prev) => {
        const now = new Date().toISOString();
        const next = fn(prev[lessonKey] ?? emptyLesson(now), now);
        return { ...prev, [lessonKey]: { ...next, updatedAt: now } };
      });
      dirty.current.add(lessonKey);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const value = useMemo<ProgressContextValue>(
    () => ({
      data,
      hydrated,
      syncState: remote ? syncState : "local",
      lesson: (key) => data[key],
      saveExerciseCode: (lessonKey, exerciseId, code) =>
        update(lessonKey, (lesson, now) => ({
          ...lesson,
          exercises: {
            ...lesson.exercises,
            [exerciseId]: {
              passed: lesson.exercises[exerciseId]?.passed ?? false,
              passedAt: lesson.exercises[exerciseId]?.passedAt,
              code,
              updatedAt: now,
            },
          },
        })),
      markExercisePassed: (lessonKey, exerciseId, code) =>
        update(lessonKey, (lesson, now) => ({
          ...lesson,
          exercises: {
            ...lesson.exercises,
            [exerciseId]: {
              passed: true,
              passedAt: lesson.exercises[exerciseId]?.passedAt ?? now,
              code,
              updatedAt: now,
            },
          },
        })),
      recordQuiz: (lessonKey, quizId, score, total) =>
        update(lessonKey, (lesson, now) => ({
          ...lesson,
          quizzes: {
            ...lesson.quizzes,
            [quizId]: {
              best: Math.max(score, lesson.quizzes[quizId]?.best ?? 0),
              last: score,
              total,
              updatedAt: now,
            },
          },
        })),
      setLessonCompleted: (lessonKey, completed) =>
        update(lessonKey, (lesson, now) => ({
          ...lesson,
          completed,
          completedAt: completed ? (lesson.completedAt ?? now) : undefined,
        })),
      importData: (raw) => {
        const incoming = sanitizeProgress(raw);
        const keys = Object.keys(incoming);
        setData((prev) => mergeProgress(prev, incoming));
        keys.forEach((k) => dirty.current.add(k));
        scheduleFlush();
        return keys.length;
      },
      resetAll: () => {
        setData({});
        dirty.current.clear();
        void remote?.clear().catch(() => setSyncState("error"));
      },
    }),
    [data, hydrated, syncState, update, scheduleFlush, remote],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside <ProgressProvider>");
  return ctx;
}
