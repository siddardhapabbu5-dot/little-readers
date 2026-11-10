import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";

export const metadata: Metadata = {
  title: "Delete your account – LEARN WISE",
  description:
    "How parents can request deletion of their Learn Wise account and their children's learning data.",
};

const h2 = { fontSize: "1.15rem", marginBottom: 8, marginTop: 28 } as const;

export default function DeleteAccountPage() {
  return (
    <MarketingPage title="Delete your Learn Wise account">
      <p style={{ marginTop: 0 }}>
        This page is for <strong>Learn Wise</strong> (Android app <code>com.littlereaders.app</code>{" "}
        and the website <a href="https://siwiapp.shop">siwiapp.shop</a>), published by SIWI. A
        parent or guardian can ask us to delete their Learn Wise account and the child profiles and
        learning data linked to it.
      </p>

      <h2 style={h2}>How to request deletion</h2>
      <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Fill in the form below with the mobile number you registered with.</li>
        <li>Add your parent email address if your account has one. This helps us find it faster.</li>
        <li>
          We verify the request with the registered mobile number or email before deleting anything.
          We may contact you to confirm.
        </li>
        <li>Once verified, we delete the account and confirm by email or SMS.</li>
      </ol>
      <p>
        Already signed in to the app? You can also send a request from{" "}
        <strong>Profile → Privacy &amp; data requests</strong>.
      </p>

      <h2 style={h2}>What we delete</h2>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Your parent account: name, mobile number, email, password and profile photo.</li>
        <li>All child profiles: names, ages, avatars and profile photos.</li>
        <li>Learning data: progress, scores, Listen &amp; Spell answers, certificates and history.</li>
        <li>Saved sign-in sessions and connected TV devices.</li>
      </ul>

      <h2 style={h2}>What we keep, and for how long</h2>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Payment and invoice records</strong> (amount, date, plan, payment reference) may
          be kept for the period required by applicable tax and accounting law. They contain no
          card numbers or learning data.
        </li>
        <li>
          <strong>A record of your deletion request</strong> is kept so we can show the request was
          handled.
        </li>
        <li>
          Copies in server backups are removed as those backups are replaced in the normal backup
          cycle.
        </li>
      </ul>

      <h2 style={h2}>Subscriptions</h2>
      <p style={{ marginTop: 0 }}>
        Deleting your account does not cancel a Google Play subscription. Cancel it first in{" "}
        <a href="https://play.google.com/store/account/subscriptions">
          Google Play → Payments &amp; subscriptions
        </a>{" "}
        so you are not charged again.
      </p>

      <DeleteAccountForm />

      <p style={{ marginTop: 28, fontSize: 14, color: "#4B5B73" }}>
        Questions? See our <a href="/privacy">Privacy Policy</a> or{" "}
        <a href="/contact">contact us</a>.
      </p>
    </MarketingPage>
  );
}
