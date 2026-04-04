import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Co-located tests: *.test.ts next to the code they test
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    host: true, // Bind to 0.0.0.0 — allows access from other devices on LAN
    port: 3000,
    watch: {
      ignored: ["**/exploration/**", "**/e2e/**", "**/scripts/**", "**/playwright-report/**", "**/test-results/**"],
    },
    proxy: {
      // Proxy ES requests to Elasticsearch.
      // Default: kupua's local docker ES on port 9220
      // Override: set KUPUA_ES_URL=http://localhost:9200 for TEST tunnel
      "/es": {
        target: process.env.KUPUA_ES_URL ?? "http://localhost:9220",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/es/, ""),
      },
      // Proxy S3 thumbnail/image requests to the local S3 proxy.
      // Only active when s3-proxy.mjs is running (--use-TEST mode).
      // See kupua/exploration/docs/s3-proxy.md for documentation.
      "/s3": {
        target: `http://127.0.0.1:${process.env.S3_PROXY_PORT ?? "3001"}`,
        changeOrigin: true,
      },
      // Proxy imgproxy requests for full-size image resizing/format-conversion.
      // Only active when imgproxy container is running (--use-TEST mode).
      // See kupua/exploration/docs/imgproxy-research.md for background.
      "/imgproxy": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/imgproxy/, ""),
      },
    },
  },
});

