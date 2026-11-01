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

/** A course on the site: its phases, electives and toolkit. Lesson progress keys are unique across courses. */
export interface CourseMeta {
  slug: string;
  /** Long name, e.g. "Mobile Apps with React Native". */
  title: string;
  /** Short name for navigation and labels, e.g. "Mobile". */
  shortTitle: string;
  tagline: string;
  description: string;
  /** The roadmap page; phases are at <href>/<phase-slug>. */
  href: string;
  /** Folder under content/ that holds the phase folders ("" for the top level). */
  contentDir: string;
  /** What learners should know before starting. */
  prerequisites: string;
  /** Languages the runnable code in this course uses. */
  languages: CodeLanguage[];
  phases: PhaseMeta[];
  electives: ElectiveMeta[];
  toolkit: Resource[];
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

/**
 * Languages that lessons can run: Python in the browser (Pyodide), Rust on the Rust Playground,
 * and React Native (TypeScript + JSX) in the simulator in lib/mobile/rn-runtime.mjs.
 */
export type CodeLanguage = "python" | "rust" | "tsx";

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
