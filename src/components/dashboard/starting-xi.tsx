import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PlayerRow } from "@/components/players/player-row";
import type { Player } from "@/lib/types/fantasy";

export function StartingXI({ players }: { players: Player[] }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Starting XI
        </h2>
        <Link
          href="/team"
          className="flex items-center gap-1 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
        >
          Full squad
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-2 divide-y divide-border">
        {players.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </div>
    </section>
  );
}
