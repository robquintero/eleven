import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION, BRAND_BACKGROUND_COLOR } from "@/lib/site-config";

/**
 * Pass 10C — the identity portion of PWA support only (brand name,
 * icons, colors, display mode). Deliberately NOT a service
 * worker/offline-install pass — see docs/SEO.md. Served at
 * `/manifest.webmanifest` by Next.js's own convention, referenced from
 * `src/app/layout.tsx`'s `metadata.manifest`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_BACKGROUND_COLOR,
    theme_color: BRAND_BACKGROUND_COLOR,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
