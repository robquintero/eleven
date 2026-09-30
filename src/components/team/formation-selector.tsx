import { SUPPORTED_FORMATIONS, canRosterSupplyFormation, type FormationName } from "@/domain/fantasy/formations";
import type { PlayerPosition } from "@/lib/types/fantasy";

/**
 * A native `<select>` (a real, accessible dropdown, per the Pass 10.5B
 * brief's own wording) rather than a custom popover — every one of
 * Eleven's 5 supported formations always stays LISTED, but a formation
 * the manager's current 16-player roster can't actually field is rendered
 * `disabled` (still visible, per the brief: "should remain visible but
 * clearly disabled, rather than disappearing"), never hidden. The parent
 * still re-validates and applies the change server-side
 * (`changeFormationAction`) — this is purely what makes an infeasible
 * option unselectable in the UI, never the authority.
 */
export function FormationSelector({
  currentFormation,
  rosterCounts,
  disabled,
  onChange,
}: {
  currentFormation: FormationName | null;
  rosterCounts: Partial<Record<PlayerPosition, number>>;
  disabled: boolean;
  onChange: (formation: FormationName) => void;
}) {
  return (
    <select
      aria-label="Formation"
      value={currentFormation ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as FormationName)}
      className="label-system rounded-control border border-border bg-surface-elevated px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none enabled:cursor-pointer enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {!currentFormation && (
        <option value="" disabled>
          CUSTOM
        </option>
      )}
      {SUPPORTED_FORMATIONS.map((formation) => {
        const feasible = canRosterSupplyFormation(rosterCounts, formation);
        return (
          <option key={formation} value={formation} disabled={!feasible}>
            {formation}
            {feasible ? "" : " — unavailable"}
          </option>
        );
      })}
    </select>
  );
}
