import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teller Berlin",
  description: "Teller Berlin staff app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Teller Berlin",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#701C42" />
      </head>
      <body className="h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}
