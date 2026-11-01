import { electives, phases, toolkit } from "@/content/curriculum";
import { mobilePhases, mobileToolkit } from "@/content/mobile/curriculum";
import type { CourseMeta } from "@/lib/types";

/**
 * Every course on the site. The first is the main course (the home page and /learn).
 * Phase and elective slugs must be unique across all courses: they're the first part of
 * every lesson's progress key.
 */
export const courses: CourseMeta[] = [
  {
    slug: "pypath",
    title: "Python, Rust, Machine Learning and Embedded Systems",
    shortTitle: "Python & Rust",
    tagline: "From your first line of Python to models running on microcontrollers.",
    description:
      "Python from zero, data analysis, maths for ML, machine learning and deep learning, a FastAPI backend, then Rust, embedded systems and TinyML. Python and a simulated microcontroller run in your browser; Rust runs on the Rust Playground.",
    href: "/learn",
    contentDir: "",
    prerequisites: "None. Start from zero.",
    languages: ["python", "rust"],
    phases,
    electives,
    toolkit,
  },
  {
    slug: "mobile",
    title: "Mobile Apps with React Native",
    shortTitle: "Mobile apps",
    tagline: "Build iOS and Android apps with React Native, Expo and TypeScript.",
    description:
      "One codebase, two platforms. Components, styling and state, navigation, networking, storage, device features, animation and accessibility, testing and performance, then a backend, sign-in and publishing to the App Store and Google Play. Code runs in a phone simulator in your browser and opens in Expo Snack to run on your own phone.",
    href: "/mobile",
    contentDir: "mobile",
    prerequisites:
      "Some programming in any language: variables, if, loops and functions. Phase 1 of the Python course is plenty. Lesson 2 teaches the TypeScript you need.",
    languages: ["tsx"],
    phases: mobilePhases,
    electives: [],
    toolkit: mobileToolkit,
  },
];

export const mainCourse = courses[0];
export const mobileCourse = courses[1];
