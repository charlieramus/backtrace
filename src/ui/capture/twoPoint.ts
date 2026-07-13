// Two-point GNSS bearing capture flow (V9 S3) — the recommended, magnetometer-free path.
//
// A small guided stepper over a frosted overlay: take Fix A (standing at the indicator),
// prompt the walk 15–30 m along the indicated direction, take Fix B, show the resulting
// bearing + its honest σ, then commit. On commit it SUPERSEDES the node (V6 append-only)
// with azimuthTrueDeg, azimuthSigmaDeg = the propagated σ (which also drives sigmaDeg so the
// posterior recomputes from it), azimuthMethod 'TWO_POINT_GNSS', and the two endpoint
// accuracies in provenance. A too-short baseline is rejected loudly (σ explodes).

import type { Store } from "../../store";
import { averageCurrentReading, type GeoReading } from "../../sensors/geo";
import { twoPointBearing, type TwoPointBearing } from "../../geo/twoPointBearing";
import { showToast } from "../toast";

export interface TwoPointCapture {
  destroy(): void;
}

const MIN_BASELINE_M = 8; // below this the bearing σ explodes — reject on commit

type Step =
  | { kind: "await-a" }
  | { kind: "taking-a" }
  | { kind: "await-b"; a: GeoReading }
  | { kind: "taking-b"; a: GeoReading }
  | { kind: "preview"; a: GeoReading; b: GeoReading; bearing: TwoPointBearing };

/** Open the two-point capture stepper for a node; commits (or cancels) then destroys itself. */
export function initTwoPointCapture(store: Store, nodeId: string, onDone?: () => void): TwoPointCapture {
  const backdrop = document.createElement("div");
  backdrop.className = "bt-modal-backdrop";
  const card = document.createElement("div");
  card.className = "bt-modal frost bt-twopoint";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  let step: Step = { kind: "await-a" };
  let pending: { cancel(): void } | null = null;

  function render(): void {
    if (step.kind === "await-a") {
      card.innerHTML = `
        <div class="bt-modal-title">Two-point bearing · Fix A</div>
        <div class="bt-modal-msg">Stand <b>at the indicator</b>. Hold still — we'll average a short burst for a tight fix.</div>
        <div class="bt-modal-actions">
          <button class="bt-mbtn ghost" data-act="cancel">Cancel</button>
          <button class="bt-mbtn primary" data-act="take-a">Take Fix A</button>
        </div>`;
    } else if (step.kind === "taking-a" || step.kind === "taking-b") {
      card.innerHTML = `
        <div class="bt-modal-title">Holding still…</div>
        <div class="bt-modal-msg">Averaging GPS fixes. Keep the device steady.</div>
        <div class="bt-modal-actions"><button class="bt-mbtn ghost" data-act="use-now">Use what we have</button></div>`;
    } else if (step.kind === "await-b") {
      card.innerHTML = `
        <div class="bt-modal-title">Two-point bearing · Fix B</div>
        <div class="bt-modal-msg">Fix A captured (±${Math.round(step.a.hAccuracyM)} m). Now <b>walk 15–30 m</b> in the indicated direction, stop, and take Fix B.</div>
        <div class="bt-modal-actions">
          <button class="bt-mbtn ghost" data-act="cancel">Cancel</button>
          <button class="bt-mbtn primary" data-act="take-b">Take Fix B</button>
        </div>`;
    } else {
      const b = step.bearing;
      const short = b.belowMinBaseline;
      card.innerHTML = `
        <div class="bt-modal-title">Bearing ${Math.round(b.azimuthTrueDeg)}° · σ ${Math.round(b.sigmaDeg)}°</div>
        <div class="bt-modal-msg">
          Baseline <b>${b.baselineM.toFixed(1)} m</b> · fixes ±${b.effAccuracyM.toFixed(1)} m.
          ${short ? `<span class="cap-flag">Baseline under ${MIN_BASELINE_M} m — σ is unreliable. Walk farther and retake.</span>` : "A longer walk lowers σ."}
        </div>
        <div class="bt-modal-actions">
          <button class="bt-mbtn ghost" data-act="restart">Retake</button>
          <button class="bt-mbtn primary" data-act="commit" ${short ? "disabled" : ""}>Commit bearing</button>
        </div>`;
    }
  }

  async function take(which: "a" | "b"): Promise<void> {
    step = which === "a" ? { kind: "taking-a" } : { kind: "taking-b", a: (step as { a: GeoReading }).a };
    render();
    const avg = averageCurrentReading(6);
    pending = avg;
    try {
      const reading = await avg.promise;
      if (which === "a") {
        step = { kind: "await-b", a: reading };
      } else {
        const a = (step as { a: GeoReading }).a;
        const bearing = twoPointBearing(
          { lat: a.lat, lon: a.lon, hAccuracyM: a.hAccuracyM },
          { lat: reading.lat, lon: reading.lon, hAccuracyM: reading.hAccuracyM },
          { minBaselineM: MIN_BASELINE_M },
        );
        step = { kind: "preview", a, b: reading, bearing };
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't get a fix.", "error");
      step = which === "a" ? { kind: "await-a" } : { kind: "await-b", a: (step as { a: GeoReading }).a };
    } finally {
      pending = null;
      render();
    }
  }

  function commit(): void {
    if (step.kind !== "preview" || step.bearing.belowMinBaseline) return;
    const { a, b, bearing } = step;
    store.supersede(nodeId, {
      azimuthTrueDeg: bearing.azimuthTrueDeg,
      sigmaDeg: bearing.sigmaDeg, // drives kappa in the posterior, exactly like a desk σ
      azimuthSigmaDeg: bearing.sigmaDeg,
      azimuthMethod: "TWO_POINT_GNSS",
      // both endpoint accuracies live in provenance
      hAccuracyM: a.hAccuracyM,
      magneticModel: null,
      declinationDeg: null,
      notes: appendNote(store, nodeId, `Two-point GNSS bearing: ${bearing.baselineM.toFixed(1)} m baseline, fixes ±${b.hAccuracyM.toFixed(1)}/${a.hAccuracyM.toFixed(1)} m.`),
    });
    showToast(`Bearing set: ${Math.round(bearing.azimuthTrueDeg)}° ± ${Math.round(bearing.sigmaDeg)}° (two-point GNSS).`, "ok");
    close();
  }

  function onClick(e: MouseEvent): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "cancel") return close();
    if (act === "take-a") return void take("a");
    if (act === "take-b") return void take("b");
    if (act === "use-now") return pending?.cancel();
    if (act === "restart") {
      step = { kind: "await-a" };
      return render();
    }
    if (act === "commit") return commit();
  }

  function close(): void {
    pending?.cancel();
    backdrop.remove();
    onDone?.();
  }

  card.addEventListener("click", onClick);
  render();

  return {
    destroy() {
      card.removeEventListener("click", onClick);
      close();
    },
  };
}

/** Append a capture note to the node's existing notes without clobbering them. */
function appendNote(store: Store, nodeId: string, note: string): string {
  const n = store.getAll().find((x) => x.id === nodeId);
  const prev = n?.notes?.trim();
  return prev ? `${prev}\n${note}` : note;
}
