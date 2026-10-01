"use client";

import { useEffect, useState } from "react";
import { useNavigationTransition } from "@/components/shell/navigation-transition";

/** Perceptible-delay threshold -- a navigation that resolves faster than this never shows anything. */
const SHOW_DELAY_MS = 150;

/**
 * The restrained "command loading" scrim over the workspace. `fixed
 * inset-0` -- anchored to the VIEWPORT, never to `<main>`, AppShell's
 * content column, or any scroll container -- so the indicator is always
 * centered on-screen regardless of scroll position or document height
 * (MICRO FIX: it was previously `absolute` inside a `relative` wrapper
 * around `<main>`, which centered it in the full document instead of the
 * visible viewport on long/scrolled pages). It still dims/blurs the
 * still-mounted outgoing page rather than replacing it -- the user sees
 * the current workspace underneath, not a separate loading page.
 *
 * `DelayedOverlay` is only ever mounted while a navigation is pending
 * (never conditionally hidden-but-mounted), keyed on the destination
 * href -- unmounting IS the reset: there's no "else" branch resetting
 * state inside an effect, just a timer that's cleaned up on unmount if
 * the navigation resolves (or a new one starts) before it fires.
 */
export function CommandTransitionOverlay() {
  const { pending } = useNavigationTransition();
  if (!pending) return null;
  return <DelayedOverlay key={pending.href} label={pending.label} />;
}

function DelayedOverlay({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-in fade-in-0 duration-150 pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-background/55 backdrop-blur-[2.5px]"
    >
      <div className="flex flex-col items-center gap-2">
        <p className="label-system text-xs text-foreground-secondary">ELEVEN / {label.toUpperCase()}</p>
        <p className="label-system text-[10px] text-foreground-tertiary">Loading workspace</p>
        <div className="mt-1 h-px w-28 overflow-hidden bg-border">
          <div className="animate-command-scan h-full w-1/3 bg-accent" />
        </div>
      </div>
    </div>
  );
}
