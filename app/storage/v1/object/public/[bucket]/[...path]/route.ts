import { serveStorageObject } from "@/lib/db/serve-object";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ bucket: string; path: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  return serveStorageObject(req, bucket, objectPath);
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}

export async function HEAD(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "range, content-type, apikey, authorization",
      "Access-Control-Expose-Headers":
        "Accept-Ranges, Content-Range, Content-Length, Content-Type",
    },
  });
}
