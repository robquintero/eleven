"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = { error?: string; message?: string } | undefined;

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { error: "Enter a display name." };
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) return { error: error.message };

  // Email confirmation is a project-level Supabase Auth setting this repo
  // doesn't control. If it's on, signUp succeeds but returns no session —
  // tell the user to check their email instead of redirecting into a
  // route that requires one.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }

  redirect("/league");
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Invalid email or password." };

  redirect("/league");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
