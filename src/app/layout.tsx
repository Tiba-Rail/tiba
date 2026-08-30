import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const editorial = Bricolage_Grotesque({ variable: "--font-editorial", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tiba — software pays a person, policy holds the line",
  description:
    "An agent-to-human payment rail. Two isolated verification channels must agree before money moves; disagreement is a refusal, never a tie-break. Sui testnet, verified through GonkaRouter."
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
