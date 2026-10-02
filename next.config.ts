import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits `.next/standalone/` — a self-contained `server.js` plus a traced
  // subset of node_modules. The Docker runner stage copies only that, `public/`
  // and `.next/static`, which is what keeps the image small and removes pnpm
  // from the runtime. Deliberately NOT `output: "export"`: this app has API
  // routes and server actions and would break.
  output: "standalone",
};

export default nextConfig;
