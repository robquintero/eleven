/**
 * Desktop-only operational strip. There is no fantasy-round scheduler yet
 * (Pass 8+ — see docs/product-state.md), so every league in the product
 * today truthfully has no active round and no fixture data; this renders
 * that state rather than a fabricated matchday/fixture count.
 */
export function StatusBar() {
  return (
    <div className="hidden items-center gap-5 border-t border-border px-4 py-1.5 lg:flex lg:px-8">
      <span className="label-system text-[10px] text-foreground-tertiary">
        NO ACTIVE ROUND
      </span>
      <span className="label-system text-[10px] text-foreground-tertiary">
        NO FIXTURE DATA
      </span>
      <span className="label-system ml-auto text-[10px] text-foreground-tertiary">
        NEXT LOCK — NOT SCHEDULED
      </span>
    </div>
  );
}
