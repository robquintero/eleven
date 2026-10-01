import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Accessibility",
  description: `Eleven's accessibility goals and how to report a barrier.`,
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility" lastUpdated="October 2026">
      <h2>Our goal</h2>
      <p>
        We want {SITE_NAME} to be usable by as many people as possible, including people who use
        a keyboard, a screen reader, or other assistive technology. We&rsquo;re working toward{" "}
        <strong>WCAG 2.2 AA</strong> as a practical target where reasonably achievable across the
        product.
      </p>

      <h2>Where we are today</h2>
      <p>
        {SITE_NAME} is in Beta, and accessibility is an ongoing effort rather than a finished
        state. We do not claim certification, full compliance, or guaranteed accessibility — we
        audit and improve real issues as we find them, and we expect to keep finding more as the
        product grows.
      </p>
      <p>Work completed so far includes, among other improvements:</p>
      <ul>
        <li>A skip-to-content link on every page.</li>
        <li>Semantic landmarks (header, nav, main) throughout the authenticated application and public pages.</li>
        <li>Visible focus states and keyboard-operable controls across interactive elements.</li>
        <li>Accessible names on icon-only controls that previously had none.</li>
        <li>Status/availability information conveyed through text and icons, not color alone.</li>
      </ul>

      <h2>Known limitations</h2>
      <p>
        Some data-dense surfaces (for example, the Team pitch and draft board) are visually
        complex, and we&rsquo;re continuing to improve their experience for screen-reader and
        keyboard users specifically. We haven&rsquo;t yet run a comprehensive assistive-technology
        testing pass across every screen.
      </p>

      <h2>Reporting a barrier</h2>
      <p>
        If you hit an accessibility barrier anywhere in {SITE_NAME}, please tell us — it helps us
        prioritize real fixes over assumptions. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with what you were trying to do,
        what happened, and the device/assistive technology you were using, if applicable.
      </p>
    </LegalPage>
  );
}
