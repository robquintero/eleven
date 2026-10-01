import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
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
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <Wordmark />
      <div>
        <p className="label-system text-xs text-foreground-tertiary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          This page doesn&rsquo;t exist.
        </h1>
        <p className="mt-3 max-w-sm text-sm text-foreground-secondary">
          The page you&rsquo;re looking for may have moved or never existed.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/" />}>
        Back to Eleven
      </Button>
    </div>
  );
}
