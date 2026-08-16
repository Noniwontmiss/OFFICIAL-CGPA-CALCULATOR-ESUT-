import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESUT CGPA Calculator",
  description: "Cumulative GPA calculator using total quality points divided by total credit units."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}