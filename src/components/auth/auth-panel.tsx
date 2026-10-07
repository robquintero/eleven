import type { ReactNode } from "react";

/** A single calm form surface, without duplicated terminal headings. */
export function AuthPanel({ children }: { children: ReactNode }) {
  return <section className="auth-panel">{children}</section>;
}
export function AuthPanelSection({ children }: { children: ReactNode }) {
  return <div className="auth-section">{children}</div>;
}
