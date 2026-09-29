"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PlayerInspector } from "@/components/players/player-inspector";
import { PlayerRow } from "@/components/players/player-row";
import { enrichMine } from "@/lib/mock/players-database";
import type { Player } from "@/lib/types/fantasy";

export function StartingXI({ players }: { players: Player[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = players.find((p) => p.id === selectedId) ?? null;

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
          <PlayerRow
            key={player.id}
            player={player}
            selected={player.id === selectedId && open}
            onSelect={() => {
              setSelectedId(player.id);
              setOpen(true);
            }}
          />
        ))}
      </div>

      <PlayerInspector
        player={selected ? enrichMine(selected) : null}
        variant="overlay"
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}
