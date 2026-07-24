import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ourcosycorner.com"),
  // Title template: the home page uses `default`; every other page sets its own
  // short title and gets "<title> — Our Cosy Corner" so Google shows a distinct,
  // correct result per page instead of the same string everywhere.
  title: {
    default: "Our Cosy Corner — A private shared space for couples, friends and families",
    template: "%s — Our Cosy Corner",
  },
  description: "Our Cosy Corner is a free desktop app for couples, friends and families. A small group shares one private workspace to plan together, keep notes and to-do lists, and save photos, files and links — synced live between everyone's computers on macOS and Windows.",
  alternates: { canonical: "/" },
  // The real app icon, not a stand-in: generated from
  // our-cosy-corner/build/icon.png so the tab icon, the search-result favicon
  // (Google wants a /favicon.ico at >=48px) and the app itself all match.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
