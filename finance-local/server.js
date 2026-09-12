"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.FINANCE_DASHBOARD_PORT || 4317);

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendFile(res, path.join(ROOT, "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && /^\/vendor\/[a-z0-9.-]+\.js$/i.test(url.pathname)) {
    sendFile(res, path.join(ROOT, "vendor", path.basename(url.pathname)), "application/javascript; charset=utf-8");
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Finance dashboard: http://localhost:${PORT}`);
  console.log("Local mode only. No Grafana, BigQuery, PostgreSQL, or env file is required.");
});
