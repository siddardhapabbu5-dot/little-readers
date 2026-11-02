import { MarketingPage } from "@/components/MarketingPage";

export default function ContactPage() {
  return (
    <MarketingPage title="Contact">
      <p>
        For school onboarding or account support, email{" "}
        <strong>support@littlereaders.example</strong> (placeholder until
        production support channels are configured).
      </p>
      <p>
        Parents can also start from <a href="/help">Help</a> or{" "}
        <a href="/login">Login</a>.
      </p>
    </MarketingPage>
  );
}
