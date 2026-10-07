import "./v2.css";
import { V2Loading } from "@/components/ui/v2";

export default function Loading() {
  return <div className="eleven-v2 v2-league space-y-6" aria-busy="true">
    <div><h1 className="v2-page-title">League</h1><p role="status" className="sr-only">LOADING LEAGUE</p></div>
    <V2Loading title="Matchweek" rows={3} /><V2Loading title="Standings" rows={4} /><V2Loading title="League records" />
  </div>;
}
