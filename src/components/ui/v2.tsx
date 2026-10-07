import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Opt-in foundation. Tokens are supplied by an .eleven-v2 ancestor. */
export function V2Surface({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn("v2-surface", className)}>{children}</section>;
}
export function V2Heading({ title, description, meta }: { title: string; description?: string; meta?: ReactNode }) {
  return <div className="v2-section-heading">
    <div className="min-w-0"><h2 className="v2-module-title">{title}</h2>{description && <p className="v2-secondary mt-1">{description}</p>}</div>
    {meta && <div className="shrink-0">{meta}</div>}
  </div>;
}
export function V2Loading({ title, rows = 2 }: { title: string; rows?: number }) {
  return <V2Surface label={`Loading ${title}`} className="v2-loading">
    <p role="status" className="v2-secondary">Loading {title.toLowerCase()}…</p>
    <div aria-hidden="true" className="mt-4 space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className="v2-skeleton" />)}</div>
  </V2Surface>;
}
