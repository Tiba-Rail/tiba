"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@mysten/dapp-kit";
import { slushBrowseUrl, isIosUserAgent } from "@/lib/slush-link";

// Shown only on iPhones that are not already inside a wallet browser. A plain
// link, so no popup for Safari to block.
export function OpenInSlush({ className = "btn btn-secondary w-full" }: { className?: string }) {
  const wallets = useWallets();
  const [href, setHref] = useState<string | null>(null);

  // The native and extension wallet both register under this id, and the web
  // wallet unregisters itself when they appear. Seeing it means a wallet is
  // already injected here, so the link would be pointless.
  const injected = wallets.some((wallet) => wallet.id === "com.mystenlabs.suiwallet");

  useEffect(() => {
    setHref(isIosUserAgent(navigator.userAgent) && !injected ? slushBrowseUrl(window.location.href) : null);
  }, [injected]);

  if (!href) return null;

  return (
    <a className={className} href={href}>
      Open in the Slush app
    </a>
  );
}
