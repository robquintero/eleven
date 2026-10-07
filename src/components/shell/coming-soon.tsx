import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SystemState } from "./system-state";

export function ComingSoon({ title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <SystemState title={title} description={description}>{children}</SystemState>;
}
