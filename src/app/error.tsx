"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { SystemState } from "@/components/shell/system-state";
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
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <div className="eleven-v2 product-v2 recovery-v2">
    <Wordmark />
    <main id="main-content"><SystemState title="Something went wrong." description="Try again, or return to Eleven to continue.">
      <Button variant="outline" onClick={retry ?? reset}>Try again</Button>
      <Button nativeButton={false} render={<Link href="/" />}>Back to Eleven</Button>
    </SystemState></main>
  </div>;
}
