import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { SystemState } from "@/components/shell/system-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Pass 10C: Eleven's own 404, replacing the raw Next.js default — see
 * docs/SEO.md. Restrained, on-brand, and genuinely useful (a way back to
 * the product), not a dead end.
 */
export default function NotFound() {
  return <div className="eleven-v2 product-v2 recovery-v2">
    <Wordmark />
    <main id="main-content"><SystemState code="404" title="This page doesn’t exist." description="Check the address, or return to Eleven.">
      <Button nativeButton={false} render={<Link href="/" />}>Back to Eleven</Button>
    </SystemState></main>
  </div>;
}
