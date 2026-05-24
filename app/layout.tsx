import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Reservation Service",
  description:
    "Reserve a unit, confirm or cancel within 10 minutes. Built as a take-home for Allo Health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
