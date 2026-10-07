import { redirect } from "next/navigation";
import { LandingView } from "@/components/public/landing-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The public product entrance — see docs/product-state.md "PUBLIC vs
 * AUTHENTICATED boundary." A signed-out visitor lands here, never on a
 * populated fantasy workspace. A signed-in visitor is sent straight into
 * the authenticated application instead of seeing marketing copy again.
 */
export default async function LandingPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/home");
  }

  return <LandingView />;
}
