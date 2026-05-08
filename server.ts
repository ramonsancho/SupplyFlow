import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import api from "./api/index";

import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Security: Global Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // Developer friendly limit
    standardHeaders: true,
    legacyHeaders: false,
    message: "Muitas requisições, tente novamente mais tarde."
  });

  // Security: Helmet with AI Studio fixes
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com", "https://www.gstatic.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com", "https://*.gstatic.com", "https://*.firebaseapp.com"],
        connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "wss://*.googleapis.com", "https://*.firebasedatabase.app"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", "https://*.run.app", "https://*.firebaseapp.com", "https://*.google.com"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: false, // Keep disabled for dev container access if needed
    frameguard: false // REQUIRED: AI Studio preview runs in an iframe
  }));

  app.use("/api/", limiter);

  console.log("[Server] Mounting API...");
  app.use("/api", api);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});
