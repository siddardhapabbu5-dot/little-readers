import { APP_NAME } from "@little-readers/shared";
import { durationText, formatInr, getPublicPlans } from "@/lib/public-data";

export const revalidate = 300;

const FEATURES = [
  ["🎧 Listen & choose", "Hear a word and pick the right picture."],
  ["✏️ Spell it", "Build spelling confidence letter by letter."],
  ["🧩 Quiz & matching", "Fun checks that reinforce every word."],
  ["⭐ Rewards", "Stars, achievements and certificates to celebrate progress."],
  ["👨‍👩‍👧 Parent dashboard", "Track progress; parent PIN protects settings and payments."],
  ["📺 Phone, web & TV", "Learn on the website, Android app or Android TV."],
];

export default async function HomePage() {
  const plans = await getPublicPlans();
  return (
    <section className="hero">
      <p className="muted" style={{ fontWeight: 700, color: "#c2410c" }}>
        Read • Spell • Learn • Succeed
      </p>
      <h1>{APP_NAME}</h1>
      <p>
        A parent-guided reading and spelling app for Grade 1 children. Short,
        colourful activities help your child learn 750 everyday English words
        across 10 topics – at home, at their own pace.
      </p>
      <div className="cta-row">
        <a
          href="/register"
          style={{
            background: "linear-gradient(135deg, #ff7a59, #ffb347)",
            color: "#1a1a1a",
            fontWeight: 800,
            padding: "14px 22px",
            borderRadius: 14,
          }}
        >
          Create parent account
        </a>
        <a
          href="/login"
          style={{
            background: "#e8f4ff",
            color: "#0b3d66",
            fontWeight: 800,
            padding: "14px 22px",
            borderRadius: 14,
          }}
        >
          Log in
        </a>
      </div>

      <div
        style={{
          marginTop: 28,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        {FEATURES.map(([title, body]) => (
          <div
            key={title}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 16,
              border: "2px solid #fed7aa",
            }}
          >
            <strong>{title}</strong>
            <div className="muted">{body}</div>
          </div>
        ))}
      </div>

      {plans.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ marginBottom: 8 }}>Simple, prepaid plans</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            One-time payment in INR, no automatic renewal.{" "}
            <a href="/pricing">See full pricing</a>.
          </p>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            {plans.map((plan) => (
              <div
                key={plan.code}
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <strong>{plan.label}</strong>
                <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                  {formatInr(plan.totalPaise || plan.amountPaise)}
                </div>
                <div className="muted">{durationText(plan.durationMonths)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
