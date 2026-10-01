import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

/**
 * Pass 10C — only genuinely public, indexable URLs (docs/SEO.md). The
 * authenticated application and auth/internal routes are deliberately
 * absent, matching `robots.ts` and `(app)/layout.tsx`'s own noindex —
 * never dump private/per-user routes into a public sitemap. `/login` and
 * `/signup` are public entry points, not private workspaces, but they're
 * low-value/transient as search results (a visitor finds them via the
 * landing page's own CTAs) so they're left off rather than padded in.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
    "/cookies",
    "/disclaimer",
    "/data-sources",
    "/accessibility",
  ];

  const lastModified = new Date();

  return staticRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "yearly",
    priority: route === "" ? 1 : 0.5,
  }));
}
