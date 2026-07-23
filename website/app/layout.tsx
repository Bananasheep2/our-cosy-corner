import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ourcosycorner.com"),
  title: "Our Cosy Corner — A private shared space for couples, friends and families",
  description: "Our Cosy Corner is a free desktop app for couples, friends and families. A small group shares one private workspace to plan together, keep notes and to-do lists, and save photos, files and links — synced live between everyone's computers on macOS and Windows.",
  alternates: { canonical: "/" },
  // The real app icon, not a stand-in: these are generated from
  // our-cosy-corner/build/icon.png so the tab icon, the home-screen icon and
  // the app itself all show the same mark.
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
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
