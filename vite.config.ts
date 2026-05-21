/// <reference types="vitest" />
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

/** `/prometheus` root is not the Prometheus web UI (that app uses absolute `/graph`, `/static/...`). Only `/prometheus/api/v1/*` is meant for fetch; browsing `/prometheus` shows this hint in dev. */
function prometheusDevLanding(): Plugin {
  return {
    name: "prometheus-dev-landing",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET") return next();
        const pathname = (req.url ?? "").split("?")[0] ?? "";
        if (pathname !== "/prometheus" && pathname !== "/prometheus/") return next();

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Prometheus (dev)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code { background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Prometheus API proxy (manteion-ui dev)</h1>
  <p>The path <code>/prometheus</code> lets the dashboard call the Prometheus HTTP API at same-origin URLs such as <code>/prometheus/api/v1/query?query=...</code>.</p>
  <p><strong>This URL is not the full Prometheus UI.</strong> That UI loads assets from <code>/graph</code>, <code>/static/...</code>, etc., which would hit Vite instead of Prometheus.</p>
  <h2>Use the real Prometheus UI</h2>
  <ol>
    <li>Port-forward (example): <code>kubectl port-forward svc/prometheus 9091:9090</code> — adjust namespace/service if needed.</li>
    <li>Open <a href="http://localhost:9091/graph"><code>http://localhost:9091</code></a> (same port as <code>vite.config.ts</code> → <code>127.0.0.1:9091</code>).</li>
  </ol>
  <p>If the dashboard metrics fail, nothing is listening on <code>127.0.0.1:9091</code>.</p>
</body>
</html>`;
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    prometheusDevLanding(),
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "(\\.test\\.(ts|tsx)$|-page\\.tsx$)",
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        // manteion-go in VM1's k3s is svc/manteion:8080. Open the SSH tunnel
        // documented in docs/ops/connecting-to-vm1.md to terminate at
        // localhost:9090:
        //   ssh -L 9090:localhost:9090 pmundra@2262-cse115b-01.be.ucsc.edu \
        //       'kubectl port-forward svc/manteion 9090:8080'
        target: "http://localhost:9090",
        changeOrigin: true,
        timeout: 30_000,
        proxyTimeout: 30_000,
      },
      // Prometheus HTTP API only (`/prometheus/api/v1/...`). Do not proxy `/prometheus` alone — Prometheus UI uses absolute paths that break under Vite.
      // Set VITE_PROMETHEUS_URL=http://localhost:5173/prometheus (BASE + /api/v1/query → /prometheus/api/v1/query).
      "/prometheus/api": {
        target: "http://127.0.0.1:9091",
        changeOrigin: true,
        timeout: 30_000,
        proxyTimeout: 30_000,
        rewrite: (p) => p.replace(/^\/prometheus/, "") || "/",
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.warn("[vite] /prometheus/api proxy → 127.0.0.1:9091:", err.message);
          });
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Claude Code worktrees stash scratch copies of the repo under
    // .claude/worktrees/<branch>/ — Vitest's default include picks up
    // their *.test.tsx files and fails to resolve @/ imports because
    // the worktree's src/ may be ahead/behind ours. Exclude the whole
    // directory so `vitest run` in any working tree is reliable.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
