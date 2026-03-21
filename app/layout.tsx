import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teller BOH",
  description: "Back of House — Teller Berlin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
