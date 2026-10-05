"use client";

import { createContext, useCallback, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface PendingNavigation { href: string; label: string }
interface NavigationTransitionContextValue {
  pending: PendingNavigation | null;
  navigate: (href: string, label: string) => void;
}
const NavigationTransitionContext = createContext<NavigationTransitionContextValue | null>(null);

/** Command/keyboard navigation uses Next's transition lifetime, including
 * query-only navigation and errors. Links use useLinkStatus instead. */
export function NavigationTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [destination, setDestination] = useState<PendingNavigation | null>(null);
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback((href: string, label: string) => {
    setDestination({ href, label });
    startTransition(() => router.push(href));
  }, [router]);
  return <NavigationTransitionContext.Provider value={{ pending: isPending ? destination : null, navigate }}>
    {children}
  </NavigationTransitionContext.Provider>;
}

export function useNavigationTransition() {
  const context = useContext(NavigationTransitionContext);
  if (!context) throw new Error("useNavigationTransition must be used within NavigationTransitionProvider");
  return context;
}
