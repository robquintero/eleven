import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Cookies & Storage",
  description: `What browser storage ${SITE_NAME} uses and why.`,
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies & Storage"
      lastUpdated="October 2026"
      intro="This page describes Eleven's actual browser-storage behavior, audited directly from the application's code — not a generic cookie-policy template."
    >
      <h2>What we use, and why</h2>
      <p>
        {SITE_NAME} uses one category of browser storage: <strong>necessary authentication
        cookies</strong>, set by Supabase (our authentication provider) to keep you signed in
        between visits and to verify your session on every request. Without these, you would be
        signed out immediately or unable to sign in at all — they are strictly necessary for{" "}
        {SITE_NAME} to function, not optional.
      </p>

      <h2>What we do not use</h2>
      <p>
        {SITE_NAME} does not currently set any analytics, advertising, or marketing cookies, and
        does not use browser local storage or session storage for tracking purposes. We have
        audited the application&rsquo;s own code to confirm this rather than assuming it.
      </p>

      <h2>Why there&rsquo;s no cookie-consent banner</h2>
      <p>
        Under common cookie-law frameworks (such as the EU&rsquo;s ePrivacy rules), strictly
        necessary cookies — the only kind {SITE_NAME} currently uses — are exempt from consent
        requirements. We have not added a consent banner because doing so, with nothing optional
        to actually consent to, would misrepresent what {SITE_NAME} does rather than clarify it.
        If we ever introduce optional analytics, advertising, or marketing technology, this page
        and an appropriate consent mechanism will be updated first.
      </p>

      <h2>Third parties</h2>
      <p>
        The only third party involved in this storage is Supabase, acting as our authentication
        infrastructure provider — it does not use these cookies for its own advertising or
        tracking purposes.
      </p>

      <h2>Questions</h2>
      <p>
        Contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with any questions about
        this page.
      </p>
    </LegalPage>
  );
}
