import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="eleven-v2 product-v2 auth-v2">
    <header><Wordmark /></header>
    <main id="main-content">{children}</main>
  </div>;
}
