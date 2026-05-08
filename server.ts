import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import * as admin from 'firebase-admin';

// Initialize Firebase Admin globally at the top
try {
  if (!admin.apps.length) {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log(`[Server] Firebase Admin initialized.`);
    }
  }
} catch (err) {
  console.error("[Server] Firebase Admin Init Error:", err);
}

// Now import the API
import api from "./api/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Simple Request Logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health-check", (req, res) => res.json({ status: "ok" }));

  // API Routes
  app.use("/api", api);

  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Starting Vite Dev Middleware...");
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
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[Server] FATAL ERROR:", err);
  process.exit(1);
});
