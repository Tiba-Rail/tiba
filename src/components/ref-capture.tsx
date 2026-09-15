"use client";

import { useEffect } from "react";
import { REF_KEY, firstTouch, parseStored, type StoredRef } from "@/lib/ref-tag";

function readCookie(): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${REF_KEY}=`));
  return hit ? hit.slice(REF_KEY.length + 1) : null;
}

export function storedRef(): StoredRef | null {
  try {
    return parseStored(window.localStorage.getItem(REF_KEY)) ?? parseStored(readCookie());
  } catch {
    return null;
  }
}

/** Runs on every page; stores the first content ref seen in this browser. */
export function RefCapture() {
  useEffect(() => {
    try {
      const existing = storedRef();
      const bid = existing?.bid ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      const next = firstTouch(existing, new URLSearchParams(window.location.search).get("ref"), new Date(), bid);
      const raw = JSON.stringify(next);
      window.localStorage.setItem(REF_KEY, raw);
      document.cookie = `${REF_KEY}=${encodeURIComponent(raw)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax; secure`;
    } catch {
      /* storage blocked: the wallet is counted on the unattributed line */
    }
  }, []);
  return null;
}
