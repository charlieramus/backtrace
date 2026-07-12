// Indicator picker — choose the "armed" indicator the next map click will place.
//
// A token-consistent custom control (not a bare <select>): a trigger button showing
// the armed indicator's color + name + default sigma, and a popover listbox of every
// indicator type. Picking one calls store.setArmedIndicator; the trigger reflects the
// armed indicator from the store (so it stays right if set elsewhere). Default is
// ANGLE_OF_CHAR (the store's initial armed code).

import type { Store } from "../../store";
import {
  INDICATOR_TYPES,
  getIndicator,
  indicatorColor,
  type IndicatorCode,
} from "../../domain/indicators";

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function sigText(code: IndicatorCode): string {
  const s = getIndicator(code)?.priorSigmaDeg;
  return s == null ? "macro" : `σ ${s}°`;
}

export interface IndicatorPicker {
  destroy(): void;
}

export function initIndicatorPicker(parent: HTMLElement, store: Store): IndicatorPicker {
  const root = document.createElement("div");
  root.className = "ind-picker";
  root.innerHTML = `
    <div class="eyebrow">Indicator to place</div>
    <button class="ind-current" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="ind-dot"></span>
      <span class="ind-name"></span>
      <span class="ind-sig num"></span>
      ${CHEVRON}
    </button>
    <div class="ind-menu" role="listbox" hidden></div>`;

  const trigger = root.querySelector(".ind-current") as HTMLButtonElement;
  const dot = root.querySelector(".ind-dot") as HTMLElement;
  const name = root.querySelector(".ind-name") as HTMLElement;
  const sig = root.querySelector(".ind-sig") as HTMLElement;
  const menu = root.querySelector(".ind-menu") as HTMLElement;

  // Build the option rows once.
  menu.innerHTML = INDICATOR_TYPES.map(
    (t) => `
      <button class="ind-opt" type="button" role="option" data-code="${t.code}">
        <span class="ind-dot" style="background:${indicatorColor(t.code)}"></span>
        <span class="ind-name">${t.label}</span>
        <span class="ind-sig num">${sigText(t.code)}</span>
      </button>`,
  ).join("");

  function reflect(): void {
    const code = store.getArmedIndicator();
    const t = getIndicator(code);
    dot.style.background = indicatorColor(code);
    name.textContent = t?.label ?? code;
    sig.textContent = sigText(code);
    for (const opt of menu.querySelectorAll<HTMLElement>(".ind-opt")) {
      opt.setAttribute("aria-selected", String(opt.dataset.code === code));
    }
  }

  function open(): void {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey, true);
  }
  function close(): void {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onDocPointer(e: PointerEvent): void {
    if (!root.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      close();
      trigger.focus();
    }
  }

  trigger.addEventListener("click", () => (menu.hidden ? open() : close()));
  menu.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement).closest(".ind-opt") as HTMLElement | null;
    if (!opt || !opt.dataset.code) return;
    store.setArmedIndicator(opt.dataset.code as IndicatorCode);
    close();
    trigger.focus();
  });

  const unsub = store.subscribe(reflect);
  reflect();
  parent.appendChild(root);

  return {
    destroy() {
      unsub();
      close();
      root.remove();
    },
  };
}
