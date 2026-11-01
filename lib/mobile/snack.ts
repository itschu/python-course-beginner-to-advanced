/**
 * Links that open code in Expo Snack (https://snack.expo.dev), which runs it on a real
 * phone with the Expo Go app, or in an iOS, Android or web preview.
 * Query parameters: https://github.com/expo/snack/blob/main/docs/url-query-parameters.md
 */
export function snackUrl(code: string, name = "PyPath Mobile example"): string {
  const files = { "App.tsx": { type: "CODE", contents: code } };
  // The docs ask for encodeURIComponent (URLSearchParams would encode spaces as "+").
  const query = Object.entries({ name, platform: "web", files: JSON.stringify(files) })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://snack.expo.dev/?${query}`;
}

/** Snack runs the file's default export, so only offer it for code that has one. */
export const canOpenInSnack = (code: string) => /\bexport\s+default\b/.test(code);
