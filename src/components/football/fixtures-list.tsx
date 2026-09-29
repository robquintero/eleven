import { fixtureCode, fixtureStateBadge } from "@/lib/team-fixture";
import type { RoundFixture } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function FixturesList({ fixtures }: { fixtures: RoundFixture[] }) {
  return (
    <div className="divide-y divide-border">
      {fixtures.map((fixture) => {
        const inPlay = fixture.state === "live" || fixture.state === "ht";
        return (
          <div key={fixture.id} className="flex items-center gap-3 py-2">
            <span
              className={cn(
                "label-system flex w-11 shrink-0 items-center gap-1 text-[11px]",
                fixture.state === "live"
                  ? "font-semibold text-live"
                  : "text-foreground-tertiary"
              )}
            >
              {fixture.state === "live" && (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-live" />
                </span>
              )}
              {fixtureStateBadge(fixture)}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "label-system text-xs",
                  inPlay ? "text-foreground" : "text-foreground-secondary"
                )}
              >
                {fixtureCode(fixture)}
              </p>
              {fixture.featuredPlayer && (
                <p className="label-system text-[10px] text-foreground-tertiary">
                  {fixture.featuredPlayer.name} · {fixture.featuredPlayer.points} PTS
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
