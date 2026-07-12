// Modal — a promise-based, token-styled confirm dialog (frosted card + backdrop). Used
// for the import replace-or-merge choice and the "Clear" confirm. Keyboard-friendly:
// Escape resolves to the cancel value; the backdrop click cancels too.

export interface ModalButton<T> {
  label: string;
  value: T;
  variant?: "primary" | "default" | "ghost";
}

export interface ModalOpts<T> {
  title: string;
  message: string;
  buttons: ModalButton<T>[];
  /** Value returned on Escape / backdrop click. */
  cancelValue: T;
}

/** Open a modal and resolve with the chosen button's value (or cancelValue). */
export function openModal<T>(opts: ModalOpts<T>): Promise<T> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "bt-modal-backdrop";

    const card = document.createElement("div");
    card.className = "bt-modal frost";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const h = document.createElement("div");
    h.className = "bt-modal-title";
    h.textContent = opts.title;

    const p = document.createElement("div");
    p.className = "bt-modal-msg";
    p.textContent = opts.message;

    const row = document.createElement("div");
    row.className = "bt-modal-actions";

    let done = false;
    const finish = (v: T): void => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(v);
    };

    for (const b of opts.buttons) {
      const btn = document.createElement("button");
      btn.className = `bt-mbtn ${b.variant ?? "default"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => finish(b.value));
      row.appendChild(btn);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") finish(opts.cancelValue);
    }

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(opts.cancelValue);
    });
    window.addEventListener("keydown", onKey);

    card.append(h, p, row);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    (row.querySelector<HTMLButtonElement>(".bt-mbtn.primary") ?? row.querySelector("button"))?.focus();
  });
}
