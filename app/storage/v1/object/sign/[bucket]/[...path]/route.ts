import { serveStorageObject } from "@/lib/db/serve-object";
import { verifyObjectToken } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ bucket: string; path: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const exp = Number(url.searchParams.get("exp") || 0);

  if (!verifyObjectToken(bucket, objectPath, exp, token)) {
    return new Response(JSON.stringify({ error: "Invalid or expired signature" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return serveStorageObject(req, bucket, objectPath, {
    cacheControl: "private, max-age=300",
  });
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}

export async function HEAD(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}
