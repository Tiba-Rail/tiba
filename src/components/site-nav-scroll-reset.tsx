"use client";

import { useEffect } from "react";

/** Keeps a mobile nav scroll position from leaking into the desktop layout after a resize. */
export function SiteNavScrollReset() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".site-nav-links");
    const resetForDesktop = () => {
      if (window.matchMedia("(min-width: 768px)").matches) nav?.scrollTo({ left: 0 });
    };

    resetForDesktop();
    window.addEventListener("resize", resetForDesktop);
    return () => window.removeEventListener("resize", resetForDesktop);
  }, []);

  return null;
}
