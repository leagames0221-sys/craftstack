import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://craftstack-collab.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "craftstack — Full-stack monorepo portfolio",
    template: "%s · craftstack",
  },
  description:
    "Two production-grade SaaS applications designed and built from schema to deploy. Boardly (realtime kanban) + Knowlex (streaming AI knowledge retrieval). Grade-A security headers, 239 Vitest + 24 Playwright tests, $0/month infra.",
  openGraph: {
    title: "craftstack — Full-stack monorepo portfolio",
    description:
      "Boardly (realtime kanban) + Knowlex (streaming AI knowledge retrieval). One Turborepo, zero-dollar infra, grade-A security headers.",
    url: SITE_URL,
    siteName: "craftstack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "craftstack",
    description:
      "Two SaaS apps, built from schema to deploy. Grade-A security headers, 239 Vitest tests, zero-dollar infra.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
