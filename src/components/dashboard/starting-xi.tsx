"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerInspector } from "@/components/players/player-inspector";
import { PlayerRow } from "@/components/players/player-row";
import { ModuleHeader } from "@/components/ui/module-header";
import { enrichMine } from "@/lib/mock/players-database";
import type { Player } from "@/lib/types/fantasy";

export function StartingXI({ players }: { players: Player[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  return (
    <section>
      <ModuleHeader
        title="STARTING_XI"
        meta={
          <Link href="/team" className="hover:text-foreground-secondary">
            {players.length} · FULL SQUAD ↗
          </Link>
        }
      />

      <div className="divide-y divide-border">
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
