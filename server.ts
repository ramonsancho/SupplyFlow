import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logger for debugging
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API Request] ${req.method} ${req.path}`);
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, replyTo, fromName } = req.body;

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return res.status(400).json({ error: "Nenhum destinatário informado." });
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("SMTP configuration missing");
      return res.status(500).json({ error: "Configuração de e-mail não encontrada no servidor." });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      // Handle both single recipient and array of recipients
      const recipients = Array.isArray(to) ? to.join(', ') : to;

      await transporter.sendMail({
        from: `"${fromName || 'SupplyFlow'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: recipients,
        subject,
        html,
        replyTo,
      });
      console.log(`[Email Sent] To: ${recipients}, Subject: ${subject}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Falha ao enviar e-mail via SMTP." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
