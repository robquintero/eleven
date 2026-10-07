import type { Metadata } from "next";
import Link from "next/link";
import { SystemState } from "@/components/shell/system-state";
import { AccountView } from "@/components/account/account-view";
import { getAccountIdentity } from "@/data-access/account";
import { getUserLeagues } from "@/data-access/leagues";

/**
 * Pass 12E: a modest authenticated Account/Settings surface — identity,
 * display name, sign out, the leagues this account belongs to, and a
 * product status line. Deliberately not a preferences system: no
 * notifications, no theming, no broader settings than this.
 */
export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const identity = await getAccountIdentity();

  if (!identity) {
    return <SystemState title="Sign in to view your account" description="Sign in to manage your profile and account.">
      <Link href="/login" className="v2-link">Sign in →</Link>
    </SystemState>;
  }

  const leagues = await getUserLeagues();

  return <AccountView identity={identity} leagues={leagues} />;
}
