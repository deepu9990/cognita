import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
// Proxying /api keeps requests same-origin so auth cookies are first-party.
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, ".", "");
    var target = env.VITE_PROXY_TARGET || "http://localhost:5000";
    return {
        plugins: [react()],
        server: {
            port: 5173,
            proxy: {
                "/api": {
                    target: target,
                    changeOrigin: true,
                    secure: true,
                    cookieDomainRewrite: "",
                },
            },
        },
    };
});
