import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RBAC Matrix — Authorization lab",
  description:
    "Interactive role × action permission matrix with conflict detection, decision preview, JSON export, and generated test cases. Portfolio demo by Saeed Rumaneh.",
  authors: [{ name: "Saeed Rumaneh" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
