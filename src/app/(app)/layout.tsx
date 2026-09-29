import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

/** The existing workstation chrome (sidebar/header/status bar) — every route in this group gets it. `(auth)` routes deliberately don't. */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
