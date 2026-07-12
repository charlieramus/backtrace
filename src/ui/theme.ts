// Theme toggle (Stage 4, UPDATELOGV1.md).
//
// The whole app is token-driven and dark-first: :root is dark, and
// :root[data-theme="light"] / the prefers-color-scheme media block flip it. This
// module lets the user override the OS preference explicitly, persists that choice
// to localStorage, and restores it on load. When the user has NOT chosen, no
// data-theme is set so the OS preference still wins.
//
// The basemap (src/map) already watches document.documentElement's data-theme via
// a MutationObserver, so flipping the attribute here also swaps the basemap.

const STORAGE_KEY = "backtrace-theme";
type Theme = "dark" | "light";

/** Apply a persisted theme choice (if any) before first paint. Call early. */
export function applyStoredTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
}

function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Wire the toolbar theme-toggle button: flip data-theme, persist, restore. */
export function initThemeToggle(button: HTMLElement): void {
  button.addEventListener("click", () => {
    const next: Theme = effectiveTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
  });
}
