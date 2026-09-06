"use client";

import { useEffect, useState } from "react";

// Cycles the highlighted noun in the hero. Honours reduced-motion by holding the first word.
export function RotatingWord({ words, intervalMs = 2400 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (words.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => window.clearInterval(id);
  }, [words, intervalMs]);
  return (
    <span key={index} className="rotating-word" aria-live="off">
      {words[index]}
    </span>
  );
}
