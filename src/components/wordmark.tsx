import Link from "next/link";
import { SigmaMark } from "./sigma-mark";

export function Wordmark({ hero = false }: { hero?: boolean }) {
  return (
    <Link href="/" aria-label="Tiba home" className={hero ? "lockup" : "lockup"}>
      <SigmaMark className="lockup-mark" />
      <span className="lockup-word">Tiba</span>
    </Link>
  );
}
