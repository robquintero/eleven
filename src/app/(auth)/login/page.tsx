import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/data-access/auth";

export const metadata: Metadata = { title: "Sign in" };

/** `authError`, when present, comes only from `/auth/callback` (never user-typed) — already mapped to friendly copy there, never a raw Supabase message. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>;
}) {
  const { authError } = await searchParams;
  return <AuthForm mode="sign-in" action={signIn} callbackError={authError} />;
}
