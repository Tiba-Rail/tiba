import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { SuiProviders } from "@/components/sui-providers";
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
  title: "Tiba — a wallet for software",
  description:
    "Tiba is a wallet for software: it pays people on your behalf, within your limits, and only after two separate checks agree on the job and the amount. Disagreement is a refusal, not a guess."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SuiProviders>{children}</SuiProviders>
      </body>
    </html>
  );
}
