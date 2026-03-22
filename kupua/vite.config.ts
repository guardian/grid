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
      // Proxy ES requests to kupua's local Elasticsearch on port 9220.
      // In the browser, fetch("/es/images/_search") → http://localhost:9220/images/_search
      "/es": {
        target: "http://localhost:9220",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/es/, ""),
      },
    },
  },
});

