"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function diffParts(target: number, now: number) {
  const ms = target - now;
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function format(parts: ReturnType<typeof diffParts>) {
  if (!parts) return "LOCKED";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (parts.days > 0) {
    return `T−${parts.days}D ${pad(parts.hours)}H`;
  }
  return `T−${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

/** Ticking countdown to a target ISO timestamp. Renders nothing until mounted
 * client-side to avoid a server/client clock mismatch. */
export function Countdown({ target, className }: { target: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={cn("tabular-nums", className)}>
      {now === null ? "—" : format(diffParts(new Date(target).getTime(), now))}
    </span>
  );
}
