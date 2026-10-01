import {
  SITE_NAME,
  SITE_URL,
  SITE_DESCRIPTION,
  OPERATOR_LEGAL_NAME,
  CONTACT_EMAIL,
} from "@/lib/site-config";

/**
 * Truthful, minimal JSON-LD (Pass 10C) — Organization + WebSite +
 * SoftwareApplication, every property a verified product fact (see
 * docs/SEO.md and docs/LEGAL-COMPLIANCE.md for the audit this came from).
 * Deliberately omits ratings, reviews, prices/offers, user counts,
 * awards, social profiles, and any release/partnership claim — none of
 * those are established facts this pass could verify, and the brief is
 * explicit that inventing them is worse than leaving them out.
 *
 * Rendered once, in the root layout, from this one static object — never
 * built from request/user-controlled data, so there's no sanitization
 * concern beyond `JSON.stringify` itself (which already escapes `<` via
 * the replace below, the one character that could otherwise break out of
 * the `<script>` tag).
 */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: OPERATOR_LEGAL_NAME,
        url: SITE_URL,
        email: CONTACT_EMAIL,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "SportsApplication",
        operatingSystem: "Web",
        softwareVersion: "Beta",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
