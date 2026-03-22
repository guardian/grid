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
    port: 3000,
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
    },
  },
});

