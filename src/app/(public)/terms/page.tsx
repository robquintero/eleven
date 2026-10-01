import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL, OPERATOR_LEGAL_NAME, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Beta Terms of Use for ${SITE_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      lastUpdated="October 2026"
      intro={
        <>
          {SITE_NAME} is operated by {OPERATOR_LEGAL_NAME}. {SITE_NAME} is currently in Beta —
          please read the Beta status section below in particular.
        </>
      }
    >
      <h2>1. Acceptance of these terms</h2>
      <p>
        By creating an account or otherwise using {SITE_NAME}, you agree to these Terms of Use.
        If you do not agree, do not use {SITE_NAME}.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        {SITE_NAME} does not currently verify age or eligibility beyond requiring a valid email
        address to create an account. We do not knowingly direct {SITE_NAME} at children, and we
        do not offer any form of real-money wagering or gambling. If you believe a specific age
        restriction should be stated here, please treat that as unresolved rather than assumed —
        see the human-review note at the bottom of this page.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You&rsquo;re responsible for the activity on your account and for keeping your
        credentials secure. You agree to provide accurate information when creating an account
        and to use your own, genuine identity rather than impersonating someone else.
      </p>

      <h2>4. Fantasy league participation</h2>
      <p>
        {SITE_NAME} organizes fantasy football leagues built around a live player draft, head-to-head
        competition, and lineup management against real football fixtures and statistics. League
        outcomes are determined entirely by {SITE_NAME}&rsquo;s own scoring rules applied to that
        data (see <a href="/data-sources">Data Sources</a>) — they do not create or confer any
        real-world prize, financial interest, or legal entitlement unless a specific league
        explicitly and separately states otherwise outside of {SITE_NAME} itself.
      </p>

      <h2>5. Beta status</h2>
      <p>
        {SITE_NAME} is in active Beta. Features may change, be added, be removed, or behave
        unexpectedly. Draft results, lineups, scores, and standings are maintained in good faith
        but are not guaranteed to be error-free during this period — see Section 8 on data
        corrections.
      </p>

      <h2>6. Availability and service changes</h2>
      <p>
        We do not guarantee uninterrupted availability. {SITE_NAME} may be modified, suspended,
        or discontinued, in whole or in part, at any time, with or without notice, particularly
        during Beta.
      </p>

      <h2>7. Football and statistical data</h2>
      <p>
        {SITE_NAME} uses a third-party football data provider for fixtures, players, and match
        statistics, which it normalizes into its own fantasy system — see{" "}
        <a href="/data-sources">Data Sources</a> for details. That underlying data may be
        delayed, incomplete, postponed, or later corrected.
      </p>

      <h2>8. Scoring and data corrections</h2>
      <p>
        Fantasy scoring is calculated by {SITE_NAME} from that provider data using {SITE_NAME}
        &rsquo;s own scoring rules. If source data is later corrected by the provider (for
        example, a statistic is revised after a match), {SITE_NAME} may recompute and update
        affected scores. We do not guarantee that every historical scoring discrepancy will be
        identified or corrected.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        {SITE_NAME}&rsquo;s software, design, and original content are owned by{" "}
        {OPERATOR_LEGAL_NAME} or its licensors. Real football club names, competition names, and
        player names referenced within {SITE_NAME} are used for descriptive, informational
        purposes and remain the property of their respective owners — see our{" "}
        <a href="/disclaimer">Disclaimer</a>.
      </p>

      <h2>10. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Access or attempt to access another user&rsquo;s account without authorization.</li>
        <li>Interfere with, disrupt, or attempt to circumvent {SITE_NAME}&rsquo;s security, draft timing, or scoring systems.</li>
        <li>Use automated means (bots, scripts) to interact with {SITE_NAME} outside of its own interface in a way not authorized by us.</li>
        <li>Use {SITE_NAME} for any unlawful purpose, or to harass, abuse, or impersonate others.</li>
        <li>Scrape, resell, or redistribute {SITE_NAME}&rsquo;s data or underlying football data in violation of the provider&rsquo;s own terms.</li>
      </ul>

      <h2>11. Third-party services</h2>
      <p>
        {SITE_NAME} relies on third-party infrastructure (including authentication, hosting, and
        football-data services) to operate. We are not responsible for the availability or
        conduct of those third parties, though we choose them carefully.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        {SITE_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
        warranties of any kind, express or implied, to the fullest extent permitted by law. We
        do not warrant that {SITE_NAME} will be uninterrupted, secure, or error-free, or that
        statistics, scores, or standings will be perfectly accurate at all times.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {OPERATOR_LEGAL_NAME} will not be liable for any
        indirect, incidental, special, or consequential damages arising from your use of{" "}
        {SITE_NAME}. This is a general framework rather than a jurisdiction-specific legal
        clause — see the human-review note below.
      </p>

      <h2>14. Termination and suspension</h2>
      <p>
        We may suspend or terminate your access to {SITE_NAME} if we believe, in good faith,
        that you have violated these Terms or used {SITE_NAME} in a way that risks harm to{" "}
        {SITE_NAME} or other users.
      </p>

      <h2>15. Changes to these terms</h2>
      <p>
        We may update these Terms as {SITE_NAME} evolves, particularly during Beta. We&rsquo;ll
        update the &ldquo;Last updated&rdquo; date above when we do. Continued use of {SITE_NAME}
        after an update constitutes acceptance of the revised Terms.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>A note on legal review</h2>
      <p>
        This page is a practical Beta-stage foundation, not a substitute for legal advice. It
        does not establish a specific governing-law or jurisdiction clause, an arbitration
        clause, or a confirmed age restriction, because none of those have been established and
        defensibly confirmed for {SITE_NAME} yet. See <a href="/disclaimer">Disclaimer</a> for
        the full list of items that require human legal review before a broad public launch.
      </p>
    </LegalPage>
  );
}
