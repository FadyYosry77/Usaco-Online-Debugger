import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function copyManifestPlugin() {
  return {
    name: "copy-manifest",
    closeBundle() {
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      copyFileSync(
        resolve(__dirname, "public", "manifest.json"),
        resolve(__dirname, "dist", "manifest.json")
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), copyManifestPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.tsx"),
        injectedBridge: resolve(__dirname, "src/injected/editorBridge.ts")
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name].[ext]"
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"]
  }
});
