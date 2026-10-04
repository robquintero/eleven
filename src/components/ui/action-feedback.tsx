import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionFeedbackKind = "rule" | "error";

/**
 * Pass 14.7 Phase 5: the one consistent treatment for action feedback
 * after a blocked/failed action — "rule" is an EXPECTED game-rule outcome
 * ("that player's match has already started," "wrong position," a roster
 * constraint) and must never look like Eleven is broken; "error" is a
 * genuine unexpected failure (network/server/write failure) and keeps the
 * existing red/destructive treatment. Never used for a successful action —
 * those simply close/refresh with no feedback banner needed here.
 */
export function ActionFeedback({ kind, message }: { kind: ActionFeedbackKind; message: string }) {
  const Icon = kind === "rule" ? Info : AlertTriangle;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "mt-2 flex items-start gap-2 border px-3 py-2 text-xs",
        kind === "rule" ? "border-warning/30 bg-warning/5 text-foreground-secondary" : "border-destructive/30 bg-destructive/5 text-destructive"
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
