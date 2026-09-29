import { Swords } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function MatchupPage() {
  return (
    <ComingSoon
      icon={Swords}
      title="Full matchup view"
      description="Live scoring, bench watch and player-by-player breakdowns are coming in a future step."
    />
  );
}
