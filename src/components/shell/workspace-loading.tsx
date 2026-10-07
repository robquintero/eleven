import { CoreHeading, CoreSurface } from "@/components/ui/core-v2";
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
  if (["Team", "Matchup", "Players", "Draft"].includes(destination)) return <CoreWorkspaceLoading destination={destination} />;
  return <div className="flex min-w-0 flex-col gap-6" aria-busy="true">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {destination === "League" ? "League hub" : destination}
      </h1>
      <p role="status" className="label-system mt-1.5 text-[11px] text-foreground-tertiary">LOADING {destination.toUpperCase()}</p>
    </div>
    {destination === "League" ? <>
      <ModuleLoading title="YOUR_LEAGUES" rows={1} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]"><ModuleLoading title="STANDINGS" rows={8} /><ModuleLoading title="MEMBERS" rows={5} /></div>
    </> : <>
      <ModuleLoading title="MATCHUP_COMMAND" rows={2} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"><ModuleLoading title="STARTING_XI" rows={11} /><ModuleLoading title="OPERATIONS" rows={4} /></div>
    </>}
  </div>;
}

/** Destination skeletons mirror the primary/secondary rhythm without invented state. */
function CoreWorkspaceLoading({ destination }: { destination: WorkspaceDestination }) {
  const rows = (count: number) => <div aria-hidden="true" className="core-loading-rows">{Array.from({length: count}, (_, index) => <div key={index}><span /><span /></div>)}</div>;
  return <div className="core-v2 flex min-w-0 flex-col gap-6" aria-busy="true">
    <div><h1 className="v2-page-title">{destination}</h1><p role="status" className="core-meta mt-2">Loading {destination.toLowerCase()}…</p></div>
    {destination === "Matchup" ? <><section className="core-hero core-loading-hero" aria-label="Loading matchup score">{rows(2)}</section><div className="grid grid-cols-2 gap-3"><CoreSurface><CoreHeading title="Your XI" />{rows(11)}</CoreSurface><CoreSurface><CoreHeading title="Opponent XI" />{rows(11)}</CoreSurface></div></>
      : destination === "Team" ? <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.5fr)]"><CoreSurface><CoreHeading title="Starting XI" meta="4-4-2" />{[["Forwards",2],["Midfield",4],["Defence",4],["Goalkeeper",1]].map(([label,count]) => <div key={label}><p className="core-position-heading core-meta">{label}</p>{rows(Number(count))}</div>)}</CoreSurface><CoreSurface className="self-start"><CoreHeading title="Bench" />{rows(5)}</CoreSurface></div>
      : destination === "Draft" ? <><section className="core-hero core-loading-hero" aria-label="Loading draft turn">{rows(2)}</section><CoreSurface><CoreHeading title="Player board" />{rows(10)}</CoreSurface></>
      : <><CoreSurface className="p-4">{rows(2)}</CoreSurface><CoreSurface><CoreHeading title="Player results" />{rows(12)}</CoreSurface></>}
  </div>;
}
