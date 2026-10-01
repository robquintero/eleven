/**
 * Pass 10C: the single source of truth for Eleven's public product
 * identity — canonical URL, legal operator, contact address, attribution,
 * and copy used across metadata, structured data, legal pages, and shell
 * chrome. Every one of these is a verified product fact (see the pass's
 * own report for the audit this came from), never a placeholder —
 * changing any of them is a real product/legal decision, which is exactly
 * why they live in one place instead of being copy-pasted across route
 * files.
 */

export const SITE_NAME = "Eleven";

/** Canonical production origin — never an old Vercel/preview URL, even in development (see `docs/SEO.md`). */
export const SITE_URL = "https://elevenfantasy.com";

export const SITE_TAGLINE = "Fantasy Football. Run Like a Club.";

export const SITE_DESCRIPTION =
  "Draft unique squads, manage your starting XI, and compete head-to-head in a fantasy football experience built to feel like running a club.";

export const SITE_DEFAULT_TITLE = "Eleven — Draft Fantasy Football";

/** Used in <title> as `%s — Eleven` for every page that sets its own `title`. */
export const SITE_TITLE_TEMPLATE = `%s — ${SITE_NAME}`;

export const OPERATOR_LEGAL_NAME = "Quintero Digital LLC";
export const OPERATOR_SHORT_NAME = "Quintero Digital";

/** The one public address for support, privacy, legal, and accessibility inquiries — see /contact. */
export const CONTACT_EMAIL = "robert@quinterodigital.com";

export const ATTRIBUTION_LINE = `Developed solely by ${OPERATOR_SHORT_NAME}`;

export const COPYRIGHT_YEAR = 2026;
export const COPYRIGHT_LINE = `© ${COPYRIGHT_YEAR} ${OPERATOR_LEGAL_NAME}. All rights reserved.`;

export const PRODUCT_STATUS = "Beta" as const;

/** The brand accent/background used for theme-color, manifest, and the generated icons — matches globals.css's `.dark` theme (the app's only theme; see src/app/globals.css). */
export const BRAND_BACKGROUND_COLOR = "#000000";
export const BRAND_ACCENT_COLOR = "#2997ff";

/** Social preview image — see public/og-image.jpg and docs/SEO.md for how it was produced from the approved brand reference. */
export const SOCIAL_IMAGE_PATH = "/og-image.jpg";
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

/** Football data provider — see /data-sources and docs/LEGAL-COMPLIANCE.md for the attribution audit. Named here once so copy referencing it stays consistent. */
export const FOOTBALL_DATA_PROVIDER_NAME = "API-Football";
