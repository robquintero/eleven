import { DisplayNameForm } from "./display-name-form";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountSection } from "./delete-account-section";
import { Button } from "@/components/ui/button";
import { signOut } from "@/data-access/auth";
import type { AccountIdentity } from "@/data-access/account";
import type { LeagueSummary } from "@/data-access/leagues";
import { TransitionLink } from "@/components/shell/transition-link";

export function AccountView({ identity, leagues }: { identity: AccountIdentity; leagues: LeagueSummary[] }) {
  return <div className="account-v2">
    <header><h1 className="v2-page-title">Account</h1><p>{identity.email ?? "No email on file"}</p></header>
    <section className="account-section"><div><h2>Profile</h2><p>Your name as it appears to other managers.</p></div><DisplayNameForm currentName={identity.displayName} /></section>
    <section className="account-section"><div><h2>Password</h2><p>Choose a new password for your account.</p></div><ChangePasswordForm /></section>
    <section className="account-section"><div><h2>Your leagues</h2><p>{leagues.length} league{leagues.length === 1 ? "" : "s"}</p></div><div>
      {leagues.length === 0 ? <><p>You haven’t joined a league yet.</p><TransitionLink href="/league" label="League" className="v2-link">Create or join a league →</TransitionLink></> : <ul className="account-leagues">{leagues.map(league => <li key={league.id}><strong>{league.name}</strong><span>{league.memberCount} / {league.maxTeams} managers · {league.role === "commissioner" ? "Commissioner" : "Manager"}</span></li>)}</ul>}
    </div></section>
    <section className="account-section"><div><h2>Session</h2><p>Sign out on this device.</p></div><form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form></section>
    <section className="account-section account-danger"><div><h2>Delete account</h2><p>Permanent account removal.</p></div><DeleteAccountSection email={identity.email ?? ""} blockedReason={identity.leaguesCreatedCount > 0 ? `You're the commissioner of ${identity.leaguesCreatedCount} league${identity.leaguesCreatedCount === 1 ? "" : "s"}. Transfer commissionership or delete ${identity.leaguesCreatedCount === 1 ? "that league" : "those leagues"} first.` : null} /></section>
    <p className="v2-meta">Eleven · Live beta</p>
  </div>;
}
