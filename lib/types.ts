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

export type LessonKind = "lesson" | "project" | "checkpoint";

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
  | { type: "code"; id: string; code: string; runnable: true }
  | { type: "static-code"; html: string }
  | {
      type: "exercise";
      id: string;
      title: string;
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
