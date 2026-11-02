import { MarketingPage } from "@/components/MarketingPage";

export default function HelpPage() {
  return (
    <MarketingPage title="Help">
      <p>
        Need access to your account? Start at the{" "}
        <a href="/login">login page</a>. Parents can register a new account from{" "}
        <a href="/register">Register</a>.
      </p>
      <p>
        School staff should ask their School Admin for login credentials. For
        password help, visit <a href="/forgot-password">Forgot Password</a> or
        contact support via <a href="/contact">Contact</a>.
      </p>
    </MarketingPage>
  );
}
