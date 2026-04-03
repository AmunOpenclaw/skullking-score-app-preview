import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skull King v2",
  description: "Framework migration bootstrap for Skull King scoring app",
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
