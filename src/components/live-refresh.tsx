"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page on a timer so a payment made from Telegram shows up here without a reload.
export function LiveRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
