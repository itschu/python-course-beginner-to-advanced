export const site = {
  name: "PyPath",
  tagline: "From your first line of Python to Rust, your own ML models, and models running on microcontrollers.",
  repo: process.env.NEXT_PUBLIC_REPO ?? "itschu/python-course-beginner-to-advanced",
  branch: process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main",
};

export function colabUrl(notebookPath: string): string {
  return `https://colab.research.google.com/github/${site.repo}/blob/${site.branch}/${notebookPath}`;
}

export function githubUrl(filePath: string): string {
  return `https://github.com/${site.repo}/blob/${site.branch}/${filePath}`;
}
