import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./login-exact.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login · LEARN WISE",
  description:
    "Parent and admin login for LEARN WISE — track progress and manage learning.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap"
      />
      <style>{`
        .shell > .nav,
        .shell > .footer { display: none !important; }
        .shell { display: block; min-height: 100vh; }
        body { margin: 0; }
      `}</style>
      {children}
    </>
  );
}
