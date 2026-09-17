import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Lifecycle",
  description: "Onboarding, Änderungen und Offboarding nachvollziehbar steuern.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
