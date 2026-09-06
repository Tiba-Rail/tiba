import { redirect } from "next/navigation";

// /intents is merged into /ledger (YC_STUDY §3, council 7/8 YES). The route
// stays live as a redirect so old links never 404.
export default function IntentsPage() {
  redirect("/ledger?filter=pending");
}
