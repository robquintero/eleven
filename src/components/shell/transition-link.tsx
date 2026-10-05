"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native auto prefetch stops at the destination loading boundary. No
 * eager full-page prefetch, click interception, timers or extra requests. */
export function TransitionLink({ label, children, className, ...props }: ComponentProps<typeof Link> & { label: string }) {
  return <Link {...props} className={cn("relative focus-visible:outline-2 focus-visible:outline-accent", className)}>
    {children}
    <LinkFeedback label={label} />
  </Link>;
}

function LinkFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent transition-opacity duration-150", pending ? "opacity-100" : "opacity-0")} />
    <span role="status" className="sr-only">{pending ? `Opening ${label}` : ""}</span>
  </>;
}
