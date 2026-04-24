import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createBrotliCompress, createGzip } from "node:zlib";

const defaultPort = "24486";
const workspaceEnvPath = resolve(import.meta.dirname, "..", "..", "..", ".env");
if (existsSync(workspaceEnvPath)) {
  process.loadEnvFile(workspaceEnvPath);
}
const root = resolve(process.cwd(), "dist/public");
const rawPort = process.env.WEB_PORT || process.env.PORT || defaultPort;
const port = Number(rawPort);
const host = process.env.HOST || "0.0.0.0";
const apiTarget = new URL(process.env.API_URL || "http://127.0.0.1:8080");

const textMimeTypes = new Set([
  "application/javascript",
  "application/json",
  "application/manifest+json",
  "image/svg+xml",
  "text/css",
  "text/html",
  "text/plain",
]);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function resolveStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = normalize(decodedPath).replace(/^(\.\.(?:\/|\\|$))+/u, "");
  const candidate = resolve(join(root, normalized));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  return candidate;
}

function proxyApi(req, res) {
  const target = new URL(req.url || "/", apiTarget);
  const proxyReq = httpRequest(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: apiTarget.host,
        "x-forwarded-host": req.headers.host || "",
        "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
      },
    },
    (proxyRes) => {
      if (res.destroyed || res.writableEnded) {
        proxyRes.resume();
        return;
      }

      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.on("error", () => {
        if (!res.destroyed && !res.writableEnded) {
          send(res, 502, "API proxy error", { "content-type": "text/plain" });
        }
      });
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    if (!res.destroyed && !res.writableEnded) {
      send(res, 502, "API proxy error", { "content-type": "text/plain" });
    }
  });

  req.on("aborted", () => {
    if (!proxyReq.destroyed) proxyReq.destroy();
  });
  res.on("close", () => {
    if (!proxyReq.destroyed) proxyReq.destroy();
  });

  if (req.readableEnded) {
    proxyReq.end();
    return;
  }

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  let filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    send(res, 403, "Forbidden", { "content-type": "text/plain" });
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  if (!existsSync(filePath)) {
    send(res, 404, "Not found", { "content-type": "text/plain" });
    return;
  }

  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const mime = mimeTypes.get(ext) || "application/octet-stream";
  const baseMime = mime.split(";", 1)[0];
  const isHtml = ext === ".html";
  const isImmutableAsset = url.pathname.startsWith("/assets/");
  const canCompress =
    textMimeTypes.has(baseMime) &&
    stat.size > 1024 &&
    !req.headers.range &&
    req.method !== "HEAD";
  const accepts = req.headers["accept-encoding"] || "";

  const headers = {
    "content-type": mime,
    "x-content-type-options": "nosniff",
    "cache-control": isImmutableAsset
      ? "public, max-age=31536000, immutable"
      : isHtml
        ? "no-cache"
        : "public, max-age=86400",
    vary: "Accept-Encoding",
  };
  const shouldBrotli = canCompress && accepts.includes("br");
  const shouldGzip = canCompress && !shouldBrotli && accepts.includes("gzip");
  const precompressedPath = shouldBrotli
    ? `${filePath}.br`
    : shouldGzip
      ? `${filePath}.gz`
      : null;
  const hasPrecompressed = precompressedPath ? existsSync(precompressedPath) : false;

  if (shouldBrotli) {
    headers["content-encoding"] = "br";
  } else if (shouldGzip) {
    headers["content-encoding"] = "gzip";
  }

  if (hasPrecompressed && precompressedPath) {
    headers["content-length"] = statSync(precompressedPath).size;
  } else if (!shouldBrotli && !shouldGzip) {
    headers["content-length"] = stat.size;
  }

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  if (hasPrecompressed && precompressedPath) {
    const stream = createReadStream(precompressedPath);
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    return;
  }

  const source = createReadStream(filePath);
  res.on("close", () => source.destroy());

  if (shouldBrotli) {
    source.pipe(createBrotliCompress()).pipe(res);
    return;
  }

  if (shouldGzip) {
    source.pipe(createGzip()).pipe(res);
    return;
  }

  source.pipe(res);
}

if (!existsSync(join(root, "index.html"))) {
  console.error("dist/public/index.html bulunamadi. Once web build alin.");
  process.exit(1);
}

if (Number.isNaN(port) || port <= 0) {
  console.error(`Gecersiz WEB_PORT/PORT degeri: "${rawPort}"`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} zaten kullanimda. Farkli bir port icin WEB_PORT veya PORT degiskeni ayarlayin.`,
    );
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Exam-Prep web ${host}:${port} uzerinde calisiyor`);
});
