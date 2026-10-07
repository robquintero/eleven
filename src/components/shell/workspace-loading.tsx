import { uiLabel } from "@/lib/ui-label";
/** Cheap server-rendered destination geometry. No data reads, invented
 * players/scores, animated shimmer, or client hydration. */
export function ModuleLoading({ title, rows = 3 }: { title: string; rows?: number }) {
  return <section aria-busy="true" aria-label={`Loading ${title}`} className="v2-panel min-w-0 border border-border">
    <div className="v2-module-label label-system border-b border-border px-4 py-2.5 text-[11px] text-foreground-secondary">{uiLabel(title)}</div>
    <div aria-hidden="true" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, index) => <div key={index} className="flex h-12 items-center justify-between gap-3 px-4">
        <span className="h-px w-1/3 bg-border" /><span className="h-px w-12 bg-border" />
      </div>)}
    </div>
  </section>;
}

export type WorkspaceDestination = "Home" | "Team" | "Matchup" | "Players" | "League" | "Draft";

export function WorkspaceLoading({ destination }: { destination: WorkspaceDestination }) {
  return <div className="flex min-w-0 flex-col gap-6" aria-busy="true">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {destination === "League" ? "League hub" : destination}
      </h1>
      <p role="status" className="label-system mt-1.5 text-[11px] text-foreground-tertiary">LOADING {destination.toUpperCase()}</p>
    </div>
    {destination === "Team" ? <>
      <div className="label-system flex flex-wrap gap-4 border border-border px-3 py-2 text-[10px] text-foreground-tertiary">FORMATION <span>STARTERS</span><span>BENCH</span></div>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.5fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <p className="label-system text-[11px] text-foreground-secondary">STARTING_XI</p>
          <ModuleLoading title="FORWARDS" rows={2} /><ModuleLoading title="MIDFIELD" rows={4} />
          <ModuleLoading title="DEFENCE" rows={4} /><ModuleLoading title="GOALKEEPER" rows={1} />
        </div>
        <ModuleLoading title="BENCH" rows={5} />
      </div>
    </> : destination === "Matchup" ? <>
      <ModuleLoading title="MATCHUP_COMMAND" rows={2} />
      <div className="grid min-w-0 grid-cols-2 gap-3"><ModuleLoading title="YOUR XI" rows={11} /><ModuleLoading title="OPPONENT XI" rows={11} /></div>
    </> : destination === "Players" ? <>
      <div aria-hidden="true" className="flex flex-wrap gap-2 border-b border-border pb-3">
        <div className="h-9 min-w-0 flex-1 border border-border" />
        {["POSITION", "COMPETITION", "CLUB"].map(label => <span key={label} className="label-system border border-border px-3 py-2 text-[10px] text-foreground-tertiary">{label}</span>)}
      </div>
      <ModuleLoading title="PLAYERS" rows={12} />
    </> : destination === "League" ? <>
      <ModuleLoading title="YOUR_LEAGUES" rows={1} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]"><ModuleLoading title="STANDINGS" rows={8} /><ModuleLoading title="MEMBERS" rows={5} /></div>
    </> : destination === "Draft" ? <ModuleLoading title="DRAFT_BOARD" rows={10} /> : <>
      <ModuleLoading title="MATCHUP_COMMAND" rows={2} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"><ModuleLoading title="STARTING_XI" rows={11} /><ModuleLoading title="OPERATIONS" rows={4} /></div>
    </>}
  </div>;
}
