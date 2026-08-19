import { Readable } from "stream";
import { openObjectStream, statObject } from "./storage";

/**
 * Serve a disk-backed storage object with Content-Length and HTTP Range.
 * Safari (especially over HTTP/3) shows a broken-image icon when large
 * JPEGs are chunked without a length.
 */
export async function serveStorageObject(
  req: Request,
  bucket: string,
  objectPath: string,
  opts?: { cacheControl?: string }
): Promise<Response> {
  const meta = await statObject(bucket, objectPath);
  if (!meta) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { fullPath, size, contentType } = meta;
  const isVideo = contentType.startsWith("video/");
  const cacheControl =
    opts?.cacheControl ||
    (isVideo
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=86400, immutable");

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Range, Content-Length, Content-Type",
  };

  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const rangeHeader = req.headers.get("range") || req.headers.get("Range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
      return new Response("Invalid Range", {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }

    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;
    const webStream = Readable.toWeb(
      openObjectStream(fullPath, { start, end })
    ) as ReadableStream;

    return new Response(webStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunkSize),
      },
    });
  }

  const webStream = Readable.toWeb(openObjectStream(fullPath)) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(size),
    },
  });
}
