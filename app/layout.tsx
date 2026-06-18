import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApplySharp",
  description: "AI-powered job search, resume tailoring, and application tracker SaaS."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-MY">
      <body>{children}</body>
    </html>
  );
}
