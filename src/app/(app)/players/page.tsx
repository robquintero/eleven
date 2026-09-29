import { PlayersWorkspace } from "@/components/players/players-workspace";
import { getPlayerDatabase } from "@/data-access/players";

export default async function PlayersPage() {
  const players = await getPlayerDatabase();
  return <PlayersWorkspace players={players} />;
}
