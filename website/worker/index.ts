/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DOWNLOADS: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Force HTTPS. Without this, http:// served a 200 alongside https://, so
    // Google indexed a duplicate http:// URL (the "second site" in search) and
    // split ranking/crawl budget across the two. Redirect before anything else.
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (url.hostname === "www.ourcosycorner.com") {
      url.hostname = "ourcosycorner.com";
      return Response.redirect(url.toString(), 308);
    }

    if (url.hostname === "downloads.ourcosycorner.com") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      const key = decodeURIComponent(url.pathname.slice(1));
      const object = key ? await env.DOWNLOADS.get(key) : null;
      if (!object) return new Response("Download not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);

      // electron-updater polls the latest*.yml manifests to discover new
      // versions. Their filenames never change, so the immutable year-long
      // cache used for installers would pin every client to whichever
      // release it first saw — serve the manifests fresh, as text, and
      // without an attachment disposition.
      if (key.endsWith(".yml")) {
        headers.set("Content-Type", "text/yaml; charset=utf-8");
        headers.set("Cache-Control", "no-cache, must-revalidate");
      } else {
        headers.set("Content-Type", "application/octet-stream");
        headers.set("Content-Disposition", `attachment; filename="${key.replace(/["\\]/g, "-")}"`);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      }
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
