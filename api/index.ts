import express from "express";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());

// Initialize Firebase Admin
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("[Firebase Admin] Inicializado com Service Account Key.");
  } else {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      admin.initializeApp({
        projectId: config.projectId,
      });
      console.log("[Firebase Admin] Inicializado com sucesso via config file.");
    } else {
      console.warn("[Firebase Admin] Arquivo de configuração não encontrado. Algumas funções podem falhar.");
    }
  }
} catch (error) {
  console.error("[Firebase Admin] Erro ao inicializar:", error);
}

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
    const from = `"${fromName || 'SupplyFlow'}" <${process.env.SMTP_FROM || user}>`;
    
    if (Array.isArray(to)) {
      // Enviar e-mails individualizados para cada destinatário
      console.log(`[Email] Enviando ${to.length} e-mails individuais...`);
      
      const emailPromises = to.map(recipient => 
        transporter.sendMail({
          from,
          to: recipient,
          subject,
          html,
          replyTo,
        })
      );
      
      await Promise.all(emailPromises);
      console.log(`[Email] Sucesso! ${to.length} e-mails individuais enviados.`);
    } else {
      // Envio único para um único destinatário
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        replyTo,
      });
      console.log(`[Email] Sucesso! E-mail enviado para: ${to}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[Email] Erro no transporte SMTP:", error);
    res.status(500).json({ 
      error: "Falha ao enviar e-mail via SMTP.",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

apiRouter.post("/delete-user", async (req, res) => {
  const { uid, email } = req.body;
  
  if (!uid && !email) {
    return res.status(400).json({ error: "UID ou Email não informado." });
  }

  try {
    if (uid) {
      await admin.auth().deleteUser(uid);
      console.log(`[Auth] Usuário deletado por UID: ${uid}`);
    } else if (email) {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(userRecord.uid);
      console.log(`[Auth] Usuário deletado por Email: ${email} (UID: ${userRecord.uid})`);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error(`[Auth] Erro ao deletar usuário (UID: ${uid}, Email: ${email}):`, error);
    
    if (error.code === 'auth/user-not-found') {
      return res.json({ success: true, message: "Usuário não encontrado no Auth, mas prosseguindo." });
    }

    res.status(500).json({ 
      error: "Falha ao deletar usuário do Firebase Authentication.",
      message: error.message 
    });
  }
});

// Registrar rotas de API
app.use("/api", apiRouter);

// Catch-all para rotas /api não encontradas
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `Rota de API não encontrada: ${req.path}` });
});

export default app;
