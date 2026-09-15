import express from "express";
import helmet from "helmet";
import path from "node:path";
import { existsSync } from "node:fs";

export function mountWebClient(app, directory) {
  const root = path.resolve(directory);
  if (!existsSync(path.join(root, "index.html")) || !existsSync(path.join(root, "sw.js"))) throw new Error("CLIENT_BUILD_MISSING: build client before starting production");
  const uiPolicy = helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"], fontSrc: ["'self'"], connectSrc: ["'self'"],
      workerSrc: ["'self'"], manifestSrc: ["'self'"], objectSrc: ["'none'"],
      baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
    },
  });
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return res.status(404).json({ code: "NOT_FOUND" });
    return uiPolicy(req, res, next);
  });
  app.use(express.static(root, {
    dotfiles: "deny", etag: true,
    setHeaders(res, file) {
      const immutable = file.startsWith(path.join(root, "assets") + path.sep);
      res.set("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
      if (file === path.join(root, "sw.js")) res.set("Service-Worker-Allowed", "/");
    },
  }));
}
