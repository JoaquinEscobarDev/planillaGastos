const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ALLOWED_PERSONS = ["joaquin", "noheli"];
const MAX_BODY_BYTES = 1e6;

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function dataFilePath(person) {
  return path.join(DATA_DIR, person + ".json");
}

function handleGetData(res, person) {
  fs.readFile(dataFilePath(person), "utf8", (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(content);
  });
}

function handlePostData(req, res, person) {
  let body = "";
  let tooLarge = false;

  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });

  req.on("end", () => {
    if (tooLarge) {
      res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "payload_too_large" }));
      return;
    }
    try {
      const parsed = JSON.parse(body);
      fs.writeFile(dataFilePath(person), JSON.stringify(parsed), (err) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "write_failed" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      });
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "invalid_json" }));
    }
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - No encontrado");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  const apiMatch = urlPath.match(/^\/api\/data\/([a-z]+)$/);

  if (apiMatch && ALLOWED_PERSONS.includes(apiMatch[1])) {
    const person = apiMatch[1];
    if (req.method === "GET") return handleGetData(res, person);
    if (req.method === "POST") return handlePostData(req, res, person);
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log("Servidor escuchando en el puerto " + PORT);
  console.log("Datos persistidos en: " + DATA_DIR);
});
