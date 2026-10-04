import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

/**
 * Pass 10C — see docs/SEO.md's index/noindex strategy for the full
 * reasoning. The authenticated application (`/home`, `/team`, `/draft`,
 * `/league`, `/matchup`, `/players`, `/account`) is ALSO noindexed per-route via
 * `(app)/layout.tsx`'s own `robots` metadata — this file is a second,
 * coarser layer (and the one a crawler actually consults first), not a
 * substitute for that. `/auth/*` and `/api/*` are internal routes with no
 * public HTML to index at all. None of this is a security boundary —
 * every authenticated route is still protected by the real Supabase
 * session check in `(app)/layout.tsx` regardless of what robots.txt says.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/home", "/team", "/draft", "/league", "/matchup", "/players", "/account", "/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
