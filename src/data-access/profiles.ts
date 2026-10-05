import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The signed-in user's own profile, or `null` if there's no session or
 * Supabase isn't configured for this environment — see
 * src/lib/supabase/config.ts. Callers must render a truthful
 * unavailable/signed-out state for `null`, never a fabricated identity.
 */
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  };
});
