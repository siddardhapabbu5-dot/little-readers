import { APP_NAME } from "@little-readers/shared";
import { SUBSCRIPTION_PACKAGES } from "@little-readers/config";

export default function HomePage() {
  return (
    <section className="hero">
      <p className="muted" style={{ fontWeight: 700, color: "#c2410c" }}>
        Multi-school educational SaaS
      </p>
      <h1>{APP_NAME}</h1>
      <p>
        One central platform for many independent schools. Teachers assign
        literacy tasks; students learn at school and at home; parents track
        progress. Annual school subscriptions power access.
      </p>
      <div className="cta-row">
        <a
          href="/login"
          style={{
            background: "linear-gradient(135deg, #ff7a59, #ffb347)",
            color: "#1a1a1a",
            fontWeight: 800,
            padding: "14px 22px",
            borderRadius: 14,
          }}
        >
          Parent / staff login
        </a>
        <a
          href="/kids"
          style={{
            background: "#e8f4ff",
            color: "#0b3d66",
            fontWeight: 800,
            padding: "14px 22px",
            borderRadius: 14,
          }}
        >
          Kids Zone
        </a>
      </div>

      <div
        style={{
          marginTop: 28,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        {[
          ["Super Admin", "/super-admin"],
          ["School", "/school"],
          ["Teacher", "/teacher"],
          ["Student", "/student"],
          ["Parent", "/parent"],
        ].map(([label, href]) => (
          <a
            key={label}
            href={href}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 16,
              border: "2px solid #fed7aa",
              fontWeight: 700,
            }}
          >
            {label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 8 }}>Annual school packages</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Prices are configurable by Super Admin. No unverified payment activation.
        </p>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {SUBSCRIPTION_PACKAGES.map((pkg) => (
            <div
              key={pkg.code}
              style={{
                background: "white",
                borderRadius: 14,
                padding: 14,
                border: "1px solid #e5e7eb",
              }}
            >
              <strong>{pkg.label}</strong>
              <div className="muted">{pkg.studentCapacity}+ students</div>
              <div>
                {pkg.annualPriceInr
                  ? `₹${pkg.annualPriceInr.toLocaleString("en-IN")}/year`
                  : "Custom pricing"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
