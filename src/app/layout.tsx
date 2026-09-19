import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { SolanaProviders } from "@/components/solana-providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"]
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tiba.rizqey.com"),
  title: "Tiba — a wallet for AI agents",
  description:
    "A wallet for AI agents. You give your agent a signed permission slip; it acts and pays only within it; you get a signed receipt for everything it does, that anyone can check.",
  openGraph: {
    title: "Tiba — a wallet for AI agents",
    description:
      "A wallet for AI agents. You give your agent a signed permission slip; it acts and pays only within it; you get a signed receipt for everything it does, that anyone can check.",
    url: "https://tiba.rizqey.com",
    siteName: "Tiba",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Tiba — a wallet for AI agents",
    description:
      "A wallet for AI agents. You give your agent a signed permission slip; it acts and pays only within it; you get a signed receipt for everything it does, that anyone can check."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
