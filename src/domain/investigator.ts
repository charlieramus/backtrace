// Investigator — who recorded a defensible record (CRESEARCH.md §3).
//
// Pure and DOM-free. The desk build is single-user, so the app carries one local
// investigator by default; field builds (V9) can capture a real identity + agency
// + qualification for the chain of custody + court exports (V7). Kept deliberately
// thin — a name and optional credentials — and referenced from a node's createdBy.

/** A person accountable for a record: the "who" in "what did you record, when". */
export interface Investigator {
  /** Stable id, referenced by Node.createdBy + audit entries. */
  id: string;
  fullName: string;
  /** Employing agency / department (optional until captured in the field). */
  agency?: string;
  /** e.g. "IAAI-CFI", "NAFI-CFEI" — the credential that qualifies the opinion. */
  qualification?: string;
  /** ISO date the qualification lapses, for a court-ready currency check. */
  certExpiry?: string;
}

function makeId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "inv_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * The default local investigator for a fresh desk case — an unnamed, single-user
 * identity so every record still has a stable `createdBy` before a real one is set.
 */
export function makeLocalInvestigator(fullName = "Local investigator"): Investigator {
  return { id: makeId(), fullName };
}
