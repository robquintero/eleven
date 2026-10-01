import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL, FOOTBALL_DATA_PROVIDER_NAME, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Data Sources",
  description: `How ${SITE_NAME} sources and uses real football data.`,
  alternates: { canonical: "/data-sources" },
};

export default function DataSourcesPage() {
  return (
    <LegalPage title="Data Sources" lastUpdated="October 2026">
      <h2>Where Eleven&rsquo;s football data comes from</h2>
      <p>
        {SITE_NAME} uses {FOOTBALL_DATA_PROVIDER_NAME}, a third-party football-data provider, for
        competitions, clubs, players, fixtures, and match statistics across the leagues{" "}
        {SITE_NAME} supports.
      </p>

      <h2>How it&rsquo;s used</h2>
      <p>
        {SITE_NAME} normalizes that provider data into its own internal fantasy system —
        players, clubs, and fixtures are stored and identified by {SITE_NAME}&rsquo;s own records,
        not the provider&rsquo;s. Fantasy scoring itself is calculated entirely by {SITE_NAME},
        using {SITE_NAME}&rsquo;s own scoring rules applied to that underlying statistical data —
        it is not a score {FOOTBALL_DATA_PROVIDER_NAME} itself produces or endorses.
      </p>

      <h2>Data limitations</h2>
      <p>
        Third-party football data can be delayed, corrected after the fact, incomplete, affected
        by postponements, or otherwise changed. {SITE_NAME} reflects the data available to it at
        the time, and may recompute affected fantasy scores if the underlying data is later
        corrected (see our <a href="/terms">Terms of Use</a>).
      </p>

      <h2>No official partnership</h2>
      <p>
        Using real competition, club, and player data does not imply an official partnership
        with, endorsement by, or license from, any football league, competition, club, governing
        body, or {FOOTBALL_DATA_PROVIDER_NAME} itself beyond {SITE_NAME}&rsquo;s own use of its
        data service. See our <a href="/disclaimer">Disclaimer</a>.
      </p>

      <h2>Provider identity vs. Eleven&rsquo;s identity</h2>
      <p>
        Any identifiers {FOOTBALL_DATA_PROVIDER_NAME} uses internally for players, clubs, or
        fixtures are external mapping details — they are not {SITE_NAME}&rsquo;s own canonical
        product identity, and are not exposed as part of the {SITE_NAME} experience.
      </p>

      <h2>Attribution</h2>
      <p>
        We have reviewed the provider documentation and terms available to us, but have not yet
        conclusively determined every specific attribution obligation that may apply. Treat that
        as an open human/legal review item rather than a settled position — see our{" "}
        <a href="/disclaimer">Disclaimer</a> for the full list of pending reviews. If you
        represent {FOOTBALL_DATA_PROVIDER_NAME} or believe a specific attribution requirement
        applies, please contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
