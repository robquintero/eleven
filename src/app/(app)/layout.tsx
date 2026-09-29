import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The auth boundary for the whole authenticated application (Home, Team,
 * Matchup, Players, League) — see docs/product-state.md "Authentication
 * boundary." Every route under `(app)` requires a real Supabase session;
 * a signed-out visitor is redirected to `/login` before any workstation
 * chrome or page data renders, rather than rendering a populated screen
 * and hiding it behind a client-side check.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
