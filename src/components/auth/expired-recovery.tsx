import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AuthPanel, AuthPanelSection } from "./auth-panel";

export function ExpiredRecovery() {
  return <AuthPanel>
    <AuthPanelSection><div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary"><KeyRound className="size-5" strokeWidth={1.75} /></span>
      <h1 className="auth-title">This link is invalid or has expired</h1>
      <p className="max-w-xs text-sm text-foreground-secondary">Password reset links can only be used once. Request a new one to continue.</p>
    </div></AuthPanelSection>
    <AuthPanelSection><p className="auth-footer"><Link href="/forgot-password" className="text-accent hover:underline">Request a new link</Link></p></AuthPanelSection>
  </AuthPanel>;
}
