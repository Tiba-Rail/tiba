import { handlers } from "@/auth";
import { withDbRoute } from "@/lib/with-db-route";

export const runtime = "nodejs";

export const GET = withDbRoute(handlers.GET);
export const POST = withDbRoute(handlers.POST);
