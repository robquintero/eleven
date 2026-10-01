import type { Metadata } from "next";
import { LegalPage } from "@/components/public/legal-page";
import { CONTACT_EMAIL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Eleven for support, privacy, legal, accessibility, or general inquiries.",
  alternates: { canonical: "/contact" },
};

const categories = [
  { label: "Support", detail: "Trouble with your account, a league, or the draft/lineup experience." },
  { label: "Privacy", detail: "Questions about data we collect or how it's used — see our Privacy Policy." },
  { label: "Legal", detail: "Terms of Use, disclaimer, or data-source questions." },
  { label: "Accessibility", detail: "A barrier you've hit using Eleven, on any device." },
  { label: "General", detail: "Anything else." },
];

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact"
      intro="Eleven is a small, independently developed product — every inquiry below reaches the same place."
    >
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for any of the following,
        and mention the category in your subject line so we can route it quickly:
      </p>
      <ul>
        {categories.map((category) => (
          <li key={category.label}>
            <strong>{category.label}</strong> — {category.detail}
          </li>
        ))}
      </ul>
      <p>We don&rsquo;t currently publish a physical address or phone number.</p>
    </LegalPage>
  );
}
