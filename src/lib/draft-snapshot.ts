import type { DraftState, DraftUpdate } from "../data-access/drafts.ts";

/** Discard polls from another draft or older than a fresh mutation payload. */
export function currentDraftUpdate(server: DraftState, polled: DraftUpdate | null): DraftUpdate | null {
  if (!polled?.draft || polled.draft.draftId !== server.draftId || polled.draft.picks.length < server.picks.length) return null;
  const statusOrder = { scheduled: 0, in_progress: 1, completed: 2 };
  if (statusOrder[polled.draft.status] < statusOrder[server.status]) return null;
  return polled;
}
