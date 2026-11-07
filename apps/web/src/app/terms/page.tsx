import { TERMS_OF_SERVICE } from "@little-readers/shared";
import { MarketingPage } from "@/components/MarketingPage";

export default function TermsPage() {
  return (
    <MarketingPage title="Terms of Service">
      <p style={{ marginTop: 0 }}>
        <strong>Version:</strong> {TERMS_OF_SERVICE.version} · Effective{" "}
        {TERMS_OF_SERVICE.effectiveDate}
      </p>
      {TERMS_OF_SERVICE.sections.map((section) => (
        <section key={section.heading} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{section.heading}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ whiteSpace: "pre-wrap", margin: "0 0 10px" }}>
              {p}
            </p>
          ))}
        </section>
      ))}
    </MarketingPage>
  );
}
