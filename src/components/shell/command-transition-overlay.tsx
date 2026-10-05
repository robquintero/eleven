"use client";

import { useNavigationTransition } from "@/components/shell/navigation-transition";

/** Nonblocking feedback for command/keyboard navigation. Native links have
 * their own pending hint; destination loading boundaries do the main work. */
export function CommandTransitionOverlay() {
  const { pending } = useNavigationTransition();
  return <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50">
    {pending && <>
      <div aria-hidden="true" className="h-0.5 bg-accent" />
      <span className="sr-only">Opening {pending.label}</span>
    </>}
  </div>;
}
