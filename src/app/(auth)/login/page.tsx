import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/data-access/auth";

export const metadata: Metadata = { title: "Sign in — Eleven" };

export default function LoginPage() {
  return <AuthForm mode="sign-in" action={signIn} />;
}
