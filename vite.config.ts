/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // Claude Code worktrees stash scratch copies of the repo under
    // .claude/worktrees/<branch>/ — Vitest's default include picks up
    // their *.test.tsx files and fails to resolve @/ imports. Exclude
    // so `vitest run` in any working tree is reliable.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
