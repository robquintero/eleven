import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";

/**
 * Minimal, chrome-free layout for /login and /signup — no sidebar, no
 * status bar. Restrained and product-native rather than a generic
 * Supabase-starter auth screen — see DESIGN.md.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-12">
      <Wordmark />
      <main id="main-content" className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
