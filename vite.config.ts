
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Wedding-Run/",   // ★ここが大事
  plugins: [react()],
});