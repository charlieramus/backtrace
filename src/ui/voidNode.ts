// Void-a-node flow — the chain-of-custody replacement for "delete".
//
// A defensible record never deletes a reading; a removal appends a VOIDED superseding
// row carrying a stated reason (CRESEARCH.md §3). This wires the token-styled reason
// prompt (a default is offered but editable) to store.void(). Cancelling changes
// nothing; the node stays active.

import type { Store } from "../store";
import { openPrompt } from "./modal";
import { showToast } from "./toast";

/** Prompt for a void reason, then void the node's chain (kept in history). */
export async function promptVoidNode(store: Store, nodeId: string): Promise<void> {
  const reason = await openPrompt({
    title: "Void this node",
    message:
      "Chain of custody keeps every reading — voiding records a reason instead of deleting it. Why is this node being removed?",
    defaultValue: "Removed by investigator",
    placeholder: "Reason for voiding",
    confirmLabel: "Void node",
  });
  if (!reason) return; // cancelled or empty — leave the node active
  store.void(nodeId, reason);
  showToast("Node voided — retained in the record with your reason.", "info");
}
