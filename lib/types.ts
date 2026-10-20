export type ResourceType =
  | "course"
  | "book"
  | "video"
  | "docs"
  | "tool"
  | "practice"
  | "article";

export interface Resource {
  title: string;
  url: string;
  type: ResourceType;
  free: boolean;
  note: string;
  author?: string;
}

export interface PhaseMeta {
  slug: string;
  number: number;
  title: string;
  tagline: string;
  description: string;
  weeks: string;
  outcomes: string[];
  resources: Resource[];
}

/**
 * An optional mini-course outside the main path. Signed-out visitors see a locked
 * preview; signed-in learners choose whether to take it.
 */
export interface ElectiveMeta {
  slug: string;
  /** Prefix for lesson numbers, e.g. "E1" gives "E1.3". */
  code: string;
  title: string;
  tagline: string;
  description: string;
  /** Suggested after this phase number; earlier phases are the prerequisites. */
  after: number;
  /** Every code cell and exercise in the elective uses this language. */
  language: CodeLanguage;
  weeks: string;
  outcomes: string[];
  resources: Resource[];
}

export type LessonKind = "lesson" | "project" | "checkpoint";

/** Languages that lessons can run: Python in the browser (Pyodide), Rust on the Rust Playground. */
export type CodeLanguage = "python" | "rust";

export interface LessonMeta {
  /** "<phase-slug>/<lesson-slug>" – stable id used for progress tracking */
  key: string;
  phaseSlug: string;
  slug: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  kind: LessonKind;
  exerciseIds: string[];
  quizIds: string[];
  /** Languages of the runnable cells and exercises in this lesson. */
  languages: CodeLanguage[];
}

export interface QuizOption {
  html: string;
  correct: boolean;
}

export interface QuizQuestion {
  promptHtml: string;
  options: QuizOption[];
  explanationHtml: string;
  multiple: boolean;
}

export type Block =
  | { type: "markdown"; html: string }
  | { type: "code"; id: string; code: string; runnable: true; language: CodeLanguage }
  | { type: "static-code"; html: string }
  | {
      type: "exercise";
      id: string;
      title: string;
      language: CodeLanguage;
      promptHtml: string;
      starter: string;
      solution: string;
      solutionHtml: string;
      tests: string;
      hintsHtml: string[];
    }
  | { type: "quiz"; id: string; title: string; questions: QuizQuestion[] }
  | {
      type: "callout";
      variant: "note" | "tip" | "warning" | "colab" | "info";
      title: string;
      html: string;
    };

export interface Lesson extends LessonMeta {
  blocks: Block[];
}
