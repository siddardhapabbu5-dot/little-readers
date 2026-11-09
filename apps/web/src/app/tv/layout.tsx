import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./tv.css";

export const metadata: Metadata = {
  title: "Learn Wise TV",
  description: "Learn Wise word games for Android TV and Google TV.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#38bdf8",
};

export default function TvLayout({ children }: { children: ReactNode }) {
  return children;
}
