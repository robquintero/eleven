import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { SiteFooter } from "@/components/shell/site-footer";
import { Button } from "@/components/ui/button";

/**
 * Pass 10C: shared shell for Eleven's public trust/legal pages (/about,
 * /contact, /terms, /privacy, /cookies, /disclaimer, /data-sources,
 * /accessibility) — the same header/footer chrome as the landing page
 * (src/app/page.tsx), not a generic document template, so these pages
 * visually belong to the product rather than reading as boilerplate
 * dropped on top of it. Prose width (`max-w-2xl`) and generous line
 * length are deliberate for long-form reading, narrower than the
 * landing page's own content column.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button nativeButton={false} size="sm" render={<Link href="/signup" />}>
            Create account
          </Button>
        </nav>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
