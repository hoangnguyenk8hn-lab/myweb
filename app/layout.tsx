import type { Metadata } from "next";
import "./current.css";
import "./selection-overrides.css";

export const metadata: Metadata = {
  title: "Diagram Draw",
  description:
    "An editable diagram drawing workspace with mathematical text, shapes, curves and TikZ export.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
