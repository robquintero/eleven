import { LeagueFormActions } from "@/components/league/league-form-actions";

/** Zero real memberships: open the existing chosen setup flow directly. */
export function NoLeagueOnboarding() {
  return <section className="onboarding-v2" aria-labelledby="onboarding-title">
    <header><p className="v2-meta">Welcome to Eleven</p><h1 id="onboarding-title">Find your league.</h1><p>Start a league of your own or join your friends. Your squad begins with the draft.</p></header>
    <LeagueFormActions choices />
  </section>;
}
