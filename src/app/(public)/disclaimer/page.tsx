import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: `${SITE_NAME} is an independent fantasy football product, not affiliated with any football league, competition, club, or players' association.`,
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" lastUpdated="October 2026">
      <h2>Independence</h2>
      <p>
        {SITE_NAME} is an independently developed fantasy football product. It is not an
        official product of, and is not sponsored by, endorsed by, or affiliated with, any
        football league, competition, club, governing body, or players&rsquo; association
        referenced by the underlying football data it uses — unless such a relationship is
        explicitly and separately stated.
      </p>

      <h2>Use of names and data</h2>
      <p>
        Real competition names, club names, and player names appear within {SITE_NAME} because
        they describe real football — the same way any sports-statistics product references real
        teams and athletes. This use is descriptive and informational. It is not a claim of
        sponsorship, license, or trademark clearance. See{" "}
        <a href="/data-sources">Data Sources</a> for how that underlying data reaches {SITE_NAME}.
      </p>

      <h2>No guarantee of accuracy</h2>
      <p>
        Fantasy scores, statistics, and standings within {SITE_NAME} are derived from third-party
        football data and {SITE_NAME}&rsquo;s own scoring logic. They are provided for the
        fantasy game itself and should not be relied on as an authoritative, real-time record of
        actual match events.
      </p>

      <h2>Not financial or wagering advice</h2>
      <p>
        {SITE_NAME} is a fantasy league management product. Nothing in {SITE_NAME} constitutes
        betting, wagering, or financial advice.
      </p>

      <h2>Human/legal review</h2>
      <p>The following have not yet undergone formal legal review and should before a broad public launch:</p>
      <ul>
        <li>Clearance of the &ldquo;{SITE_NAME}&rdquo; name/trademark for the markets we operate in.</li>
        <li>Any use of league, club, or player marks beyond descriptive, informational reference.</li>
        <li>Football-data licensing terms and any specific attribution obligations owed to our data provider (see <a href="/data-sources">Data Sources</a>).</li>
        <li>General public-launch legal review across these pages as a whole.</li>
      </ul>
      <p>
        This page does not constitute legal advice or legal clearance. Questions can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
