import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ourcosycorner.com"),
  title: "Our Cosy Corner — A shared space for two",
  description: "Our Cosy Corner is a free desktop app for couples. Two people share one private workspace to plan together, keep notes and to-do lists, and save photos, files and links — synced live between both computers on macOS and Windows.",
  alternates: { canonical: "/" },
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
