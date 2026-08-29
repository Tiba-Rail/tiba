import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiba API",
  description: "Match, don't mint."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
