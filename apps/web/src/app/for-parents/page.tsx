import { MarketingPage } from "@/components/MarketingPage";

export default function ForParentsPage() {
  return (
    <MarketingPage title="For Parents">
      <p>
        Create a parent account, add child profiles, and follow reading,
        spelling and learning progress from home.
      </p>
      <p>
        <a href="/register">Register</a> · <a href="/login">Login</a> ·{" "}
        <a href="/parent">Parent dashboard</a>
      </p>
    </MarketingPage>
  );
}
