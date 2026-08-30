import { redirect } from "next/navigation";

// The product's public surface is the ledger. A bare hit on the root should
// land there rather than on a placeholder. A proper landing page replaces this.
export default function Home() {
  redirect("/ledger");
}
