// Offline status chip (Stage 4, UPDATELOGV1.md).
//
// Backtrace has no server and no account — persistence is files (v5). The chip
// reflects real device connectivity only; it must NEVER imply server sync. Online:
// the mockup's "Offline-ready · no account" with the --ok dot. Offline: an altered,
// muted state that still reassures the app keeps working locally.

/** Wire the status chip to real connectivity (navigator.onLine + online/offline). */
export function initOfflineChip(chip: HTMLElement): void {
  const label = chip.querySelector<HTMLElement>(".status-label");

  function render(): void {
    const online = navigator.onLine;
    chip.classList.toggle("off", !online);
    if (label) {
      label.textContent = online
        ? "Offline-ready · no account"
        : "Offline · working locally";
    }
  }

  window.addEventListener("online", render);
  window.addEventListener("offline", render);
  render();
}
