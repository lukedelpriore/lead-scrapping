import type { Metadata } from "next";
import { bricolage, plexSans, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Engine",
  description: "Del Priore Hospitality Lead Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
