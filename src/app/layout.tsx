import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
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
  title: "Tiba — the check before an agent's payment goes out",
  description:
    "The check before an AI agent's payment goes out. It reads the bill against your own record, pays only when they match, and refuses — with a receipt — when they don't.",
  openGraph: {
    title: "Tiba — the check before an agent's payment goes out",
    description:
      "The check before an AI agent's payment goes out. It reads the bill against your own record, pays only when they match, and refuses — with a receipt — when they don't.",
    url: "https://tiba.rizqey.com",
    siteName: "Tiba",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Tiba — the check before an agent's payment goes out",
    description:
      "The check before an AI agent's payment goes out. It reads the bill against your own record, pays only when they match, and refuses — with a receipt — when they don't."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SolanaProviders>
          {children}
          <SiteFooter />
        </SolanaProviders>
      </body>
    </html>
  );
}
