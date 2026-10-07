import type { ReactNode } from "react";

/** Shared, data-free recovery/lifecycle presentation; callers own the next action. */
export function SystemState({ title, description, code, children }: { title: string; description: string; code?: string; children?: ReactNode }) {
  return <section className="system-state" aria-labelledby="system-state-title">
    {code && <p className="v2-meta">{code}</p>}
    <h1 id="system-state-title">{title}</h1>
    <p>{description}</p>
    {children && <div className="entry-actions">{children}</div>}
  </section>;
}
