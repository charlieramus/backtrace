// Toast — a small frosted, token-styled banner for loud-but-graceful messages (a bad
// import file, a successful export). Slides in top-center, auto-dismisses. On-system with
// the rest of the chrome: rounded, frosted, tabular where it counts.

export type ToastKind = "info" | "error" | "ok";

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.className = "bt-toasts";
  document.body.appendChild(container);
  return container;
}

/** Show a toast. Errors linger a little longer; all are dismissible by click. */
export function showToast(message: string, kind: ToastKind = "info"): void {
  const root = ensureContainer();
  const el = document.createElement("div");
  el.className = `bt-toast frost ${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.textContent = message;
  root.appendChild(el);

  const ttl = kind === "error" ? 6000 : 3200;
  const remove = (): void => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  };
  const timer = window.setTimeout(remove, ttl);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}
