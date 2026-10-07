import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./core-v2.css";

/** Presentation only: all core workspaces inherit the released V2 tokens. */
export function CoreSurface({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn("core-surface", className)}>{children}</section>;
}

export function CoreHeading({ title, meta }: { title: string; meta?: ReactNode }) {
  return <div className="core-heading"><h2>{title}</h2>{meta && <span className="core-meta">{meta}</span>}</div>;
}
