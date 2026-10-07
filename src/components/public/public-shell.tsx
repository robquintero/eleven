import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { SiteFooter } from "@/components/shell/site-footer";
import { Button } from "@/components/ui/button";

/** Shared, data-free public entrance. Authentication stays in the route. */
export function PublicShell({ children, document = false }: { children: ReactNode; document?: boolean }) {
  return <div className="eleven-v2 product-v2 public-v2">
    <header className="public-header">
      <Wordmark />
      <nav aria-label="Account">
        <Button nativeButton={false} variant="ghost" render={<Link href="/login" />}>Sign in</Button>
        <Button nativeButton={false} render={<Link href="/signup" />}>Create account</Button>
      </nav>
    </header>
    <main id="main-content" className={document ? "public-document" : "public-landing"}>{children}</main>
    <SiteFooter />
  </div>;
}
