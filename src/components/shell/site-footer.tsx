import Link from "next/link";
import { ATTRIBUTION_LINE, COPYRIGHT_LINE, PRODUCT_STATUS, SITE_NAME } from "@/lib/site-config";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/data-sources", label: "Data sources" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/disclaimer", label: "Disclaimer" },
];

/**
 * Pass 10C: the one place public/trust links, legal attribution, and the
 * ELEVEN · BETA indicator live — used on the landing page and every
 * public legal/trust page, deliberately NOT repeated on every individual
 * component (see docs/LEGAL-COMPLIANCE.md). Understated by design: small
 * type, tertiary color, no visual competition with the product's own
 * content above it.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <nav aria-label="Legal and trust" className="flex flex-wrap gap-x-4 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="label-system text-[11px] text-foreground-tertiary transition-colors hover:text-foreground-secondary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-foreground-tertiary">
          <span>{COPYRIGHT_LINE}</span>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span>{ATTRIBUTION_LINE}</span>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span className="label-system rounded-full border border-border px-2 py-0.5 text-[10px] text-foreground-tertiary">
            {SITE_NAME.toUpperCase()} · {PRODUCT_STATUS.toUpperCase()}
          </span>
        </div>
      </div>
    </footer>
  );
}
