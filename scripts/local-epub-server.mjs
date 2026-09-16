import { createReadStream, existsSync, promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = path.join(projectRoot, "out");
const port = Number(process.env.EPUB_READER_PORT || 3000);
let idleTimer;

const resetIdleTimer = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => server.close(() => process.exit(0)), 10 * 60 * 1000);
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const send = (response, status, body, type = "text/plain; charset=utf-8") => {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(body);
};

const server = createServer(async (request, response) => {
  resetIdleTimer();
  try {
    const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);

    if (requestUrl.pathname === "/epub") {
      const filePath = requestUrl.searchParams.get("path");
      if (!filePath || !filePath.toLowerCase().endsWith(".epub")) return send(response, 400, "An EPUB path is required.");
      const resolvedPath = path.resolve(filePath);
      const fileInfo = await fs.stat(resolvedPath);
      if (!fileInfo.isFile()) return send(response, 404, "EPUB file not found.");
      response.writeHead(200, { "Content-Type": "application/epub+zip", "Content-Length": fileInfo.size, "Cache-Control": "no-store" });
      return createReadStream(resolvedPath).pipe(response);
    }

    if (!existsSync(staticRoot)) return send(response, 503, "Build the static app before opening an EPUB.");
    const requestedPath = decodeURIComponent(requestUrl.pathname);
    const candidate = path.resolve(staticRoot, `.${requestedPath === "/" ? "/index.html" : requestedPath}`);
    const relativePath = path.relative(staticRoot, candidate);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return send(response, 403, "Forbidden.");
    const fileInfo = await fs.stat(candidate);
    if (!fileInfo.isFile()) return send(response, 404, "Not found.");
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(candidate).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    return createReadStream(candidate).pipe(response);
  } catch {
    return send(response, 404, "Not found.");
  }
});

server.listen(port, "127.0.0.1", () => {
  resetIdleTimer();
  console.log(`EPUB Reader running at http://127.0.0.1:${port}`);
});
