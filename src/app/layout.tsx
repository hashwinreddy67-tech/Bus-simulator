import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INFINITE ROADS — The Ultimate Bus Simulator",
  description: "One World. Endless Roads. Drive • Explore • Build • Conquer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
