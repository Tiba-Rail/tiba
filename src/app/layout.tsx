import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Inter({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const editorial = Instrument_Serif({ variable: "--font-editorial", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Tiba — software pays a person, policy holds the line",
  description:
    "An agent-to-human payment rail. Two isolated verification channels must agree before money moves; disagreement is a refusal, never a tie-break."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${editorial.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}