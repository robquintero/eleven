import type { ReactNode } from "react";

/**
 * Pass 10C: shared long-form-reading styling for every public trust/legal
 * page, applied via descendant selectors on one wrapper rather than a
 * typography plugin dependency or per-paragraph wrapper components — each
 * page just writes plain `<h2>`/`<h3>`/`<p>`/`<ul>`/`<a>`/`<strong>`
 * inside `children`. Deliberately restrained: no decorative elements,
 * generous line-height, body copy sized for actual reading rather than
 * the product UI's smaller operational type scale.
 */
export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {lastUpdated && (
        <p className="mt-2 text-xs text-foreground-tertiary">Last updated {lastUpdated}</p>
      )}
      {intro && <p className="mt-4 text-sm text-foreground-secondary sm:text-base">{intro}</p>}
      <div
        className="mt-8 text-sm leading-relaxed text-foreground-secondary sm:text-base
          [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2:first-child]:mt-0
          [&_h3]:mt-6 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground
          [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5
          [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-foreground
          [&_strong]:font-semibold [&_strong]:text-foreground"
      >
        {children}
      </div>
    </article>
  );
}
