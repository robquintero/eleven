import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { StructuredData } from "@/components/seo/structured-data";
import {
  SITE_NAME,
  SITE_URL,
  SITE_DEFAULT_TITLE,
  SITE_TITLE_TEMPLATE,
  SITE_DESCRIPTION,
  OPERATOR_SHORT_NAME,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_WIDTH,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_ALT,
} from "@/lib/site-config";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * Pass 10C: centralized SEO/metadata architecture — see docs/SEO.md for
 * the full strategy (index/noindex boundary, sitemap, robots, structured
 * data, social image, icons). Every route-specific `metadata` export
 * elsewhere in the app only needs to set `title`/`description`; it
 * inherits `metadataBase`, the title template, OG/Twitter defaults, and
 * icons from here, per Next.js App Router metadata merging.
 *
 * `(app)/layout.tsx` overrides `robots` to noindex the entire
 * authenticated application — this root metadata is the PUBLIC default
 * (landing page, /about, /terms, etc.), which should stay indexable.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_DEFAULT_TITLE,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: OPERATOR_SHORT_NAME }],
  creator: OPERATOR_SHORT_NAME,
  publisher: OPERATOR_SHORT_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        width: SOCIAL_IMAGE_WIDTH,
        height: SOCIAL_IMAGE_HEIGHT,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE_PATH],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }],
    apple: [{ url: "/apple-icon.png" }],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0d0f12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark h-full antialiased ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-100 focus-visible:rounded-control focus-visible:border focus-visible:border-ring focus-visible:bg-surface-elevated focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Skip to main content
        </a>
        {children}
        <StructuredData />
      </body>
    </html>
  );
}
