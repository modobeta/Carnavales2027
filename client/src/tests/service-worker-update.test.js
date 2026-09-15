import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { buildServiceWorker } from "../../scripts/build-service-worker.js";

describe("service worker updates", () => {
  it("versions each build and prefers fresh navigation without forcing activation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "carnaval-sw-"));
    try {
      const template = path.resolve("public/sw.js");
      await writeFile(path.join(dir, "index.html"), "version one");
      const first = await buildServiceWorker(dir, template);
      expect(await buildServiceWorker(dir, template)).toBe(first);
      await writeFile(path.join(dir, "index.html"), "version two");
      expect(await buildServiceWorker(dir, template)).not.toBe(first);
      const source = await readFile(path.join(dir, "sw.js"), "utf8");
      expect(source).not.toContain("__BUILD_ID__");
      const handlers = {}; let response; let networkCalls = 0;
      const context = {
        URL, Response,
        self: { location: { origin: "https://app.test" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
        fetch: async () => { networkCalls++; return "fresh"; },
        caches: { open: async () => ({ match: async () => "old" }) },
      };
      vm.runInNewContext(source, context);
      handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://app.test/" }, respondWith: (p) => { response = p; } });
      expect(await response).toBe("fresh"); expect(networkCalls).toBe(1);
      response = undefined;
      handlers.fetch({ request: { method: "GET", url: "https://app.test/api/auth/get-session" }, respondWith: (p) => { response = p; } });
      expect(response).toBeUndefined();
      context.fetch = async () => { throw Error("offline"); };
      handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://app.test/" }, respondWith: (p) => { response = p; } });
      expect(await response).toBe("old");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
