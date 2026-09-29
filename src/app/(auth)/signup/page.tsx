import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/data-access/auth";

export const metadata: Metadata = { title: "Create account — Eleven" };

export default function SignupPage() {
  return <AuthForm mode="sign-up" action={signUp} />;
}
