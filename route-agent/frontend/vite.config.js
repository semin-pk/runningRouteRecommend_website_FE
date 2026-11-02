import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  if (command === "build" && mode === "production") {
    let apiUrl;
    try {
      apiUrl = new URL(env.VITE_API_BASE_URL?.trim());
    } catch {
      throw new Error("frontend/.env.production에 VITE_API_BASE_URL을 설정해주세요.");
    }
    if (apiUrl.protocol !== "https:") {
      throw new Error("운영 VITE_API_BASE_URL은 HTTPS 주소여야 합니다.");
    }
  }

  return {
    base: mode === "development" ? "/" : "/agent/",
    plugins: [react(), tailwindcss()],
  };
});
