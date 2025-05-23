import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "build", // Change the output directory to 'build'
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["27c4-117-99-100-200.ngrok-free.app"], // Add ngrok URL here
  },
  proxy: {
    "/api": {
      target: "http://localhost:5000",
      changeOrigin: true,
      secure: false,
    },
  },
});
