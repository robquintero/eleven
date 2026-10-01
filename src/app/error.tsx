"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Pass 10C: Eleven's own root error boundary, replacing the raw Next.js
 * default — see docs/SEO.md. Error boundaries are required Client
 * Components in the App Router. Deliberately doesn't interfere with any
 * route-specific error.tsx that already exists inside (app)/ — this only
 * ever catches an error that escapes all the way to the root.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <Wordmark />
      <div>
        <p className="label-system text-xs text-foreground-tertiary">ERROR</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Something went wrong.
        </h1>
        <p className="mt-3 max-w-sm text-sm text-foreground-secondary">
          This has been logged. Try again, or head back to Eleven.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to Eleven
        </Button>
      </div>
    </div>
  );
}
