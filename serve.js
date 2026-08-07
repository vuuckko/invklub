/**
 * Zero-dependency static server for the InvKlub site.
 *   node serve.js  ->  http://localhost:5540/index.html
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = 5540;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const rel = url === "/" ? "/index.html" : url;
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));

    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const size = fs.statSync(file).size;
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`InvKlub -> http://localhost:${PORT}/index.html`);
  });
