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

  console.log(`[Server] Iniciando servidor no modo: ${process.env.NODE_ENV || 'development'}`);

  app.use(express.json());

  // Logger de requisições global
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // Rotas de API
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || 'development',
      time: new Date().toISOString()
    });
  });

  apiRouter.post("/send-email", async (req, res) => {
    const { to, subject, html, replyTo, fromName } = req.body;
    console.log(`[Email] Tentativa de envio para: ${to}`);

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return res.status(400).json({ error: "Nenhum destinatário informado." });
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      console.error("[Email] Configuração SMTP incompleta no ambiente");
      return res.status(500).json({ 
        error: "Configuração de e-mail (SMTP) não encontrada no servidor. Verifique as variáveis de ambiente.",
        details: { host: !!host, user: !!user, pass: !!pass }
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user, pass },
    });

    try {
      const recipients = Array.isArray(to) ? to.join(', ') : to;

      await transporter.sendMail({
        from: `"${fromName || 'SupplyFlow'}" <${process.env.SMTP_FROM || user}>`,
        to: recipients,
        subject,
        html,
        replyTo,
      });
      
      console.log(`[Email] Sucesso! Enviado para: ${recipients}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Email] Erro no transporte SMTP:", error);
      res.status(500).json({ 
        error: "Falha ao enviar e-mail via SMTP.",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Registrar rotas de API antes do Vite
  app.use("/api", apiRouter);

  // Catch-all para rotas /api não encontradas (evita cair no Vite)
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.path}` });
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
