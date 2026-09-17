import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
  server: {
    port: 5175,
    strictPort: true,
    watch: {
      ignored: ["**/output/**"],
    },
  },
});
