import express from "express";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import https from "https";
import "dotenv/config";

const app = express();
app.use(express.json());

// Initialize Firebase Admin
try {
  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        
        // Fix for private key newlines in environment variables
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("[Firebase Admin] Inicializado com Service Account Key do ambiente.");
      } catch (parseError) {
        console.error("[Firebase Admin] Erro ao processar FIREBASE_SERVICE_ACCOUNT_KEY:", parseError);
        throw parseError;
      }
    } else {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        admin.initializeApp({
          projectId: config.projectId,
        });
        console.log("[Firebase Admin] Inicializado via arquivo de configuração.");
      } else {
        console.warn("[Firebase Admin] Nenhuma configuração encontrada (env ou arquivo).");
      }
    }
  }
} catch (error) {
  console.error("[Firebase Admin] Erro crítico na inicialização:", error);
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
    firebaseAdmin: admin.apps.length > 0 ? "initialized" : "not_initialized",
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    smtpConfig: {
      host: process.env.SMTP_HOST || "not_set",
      user: process.env.SMTP_USER || "not_set",
      hasPass: !!process.env.SMTP_PASS,
      port: process.env.SMTP_PORT || "587",
      from: process.env.SMTP_FROM || "not_set"
    },
    time: new Date().toISOString()
  });
});

apiRouter.post("/send-email", async (req, res) => {
  const { to, subject, html, text, replyTo, fromName } = req.body;
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
      console.log(`[Email] Enviando ${to.length} e-mails individuais para: ${to.join(', ')}`);
      
      const results = [];
      for (const recipient of to) {
        try {
          const info = await transporter.sendMail({
            from,
            to: recipient,
            subject,
            html,
            text: text || "Solicitação de Aprovação SupplyFlow. Por favor, acesse o sistema para mais detalhes.",
            replyTo,
          });
          results.push({ recipient, success: true, messageId: info.messageId });
          console.log(`[Email] Sucesso para: ${recipient} (MessageID: ${info.messageId})`);
        } catch (err) {
          console.error(`[Email] Falha para: ${recipient}`, err);
          results.push({ recipient, success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`[Email] Concluído. Sucesso: ${successCount}/${to.length}`);
      
      if (successCount === 0 && to.length > 0) {
        return res.status(500).json({ 
          error: "Falha ao enviar todos os e-mails.",
          details: results
        });
      }
      
      return res.json({ success: true, details: results });
    } else {
      // Envio único para um único destinatário
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || "Solicitação de Aprovação SupplyFlow. Por favor, acesse o sistema para mais detalhes.",
        replyTo,
      });
      console.log(`[Email] Sucesso! E-mail enviado para: ${to} (MessageID: ${info.messageId})`);
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

apiRouter.post("/send-teams", async (req, res) => {
  const { webhookUrl, title, text, sections, potentialAction } = req.body;

  if (!webhookUrl) {
    return res.status(400).json({ error: "Webhook URL não informada." });
  }

  // Payload no formato MessageCard (padrão para Incoming Webhooks)
  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "0052FF",
    "summary": title,
    "title": title,
    "text": text,
    "sections": sections,
    "potentialAction": potentialAction
  };

  try {
    console.log(`[Teams] Enviando para: ${webhookUrl.substring(0, 50)}...`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log(`[Teams] Sucesso! Resposta: ${responseText}`);
      return res.json({ success: true, details: responseText });
    } else {
      console.error(`[Teams] Erro do Teams (${response.status}): ${responseText}`);
      
      // Se falhou com o payload complexo, tenta um payload ultra-simples como fallback
      console.log(`[Teams] Tentando fallback com payload simples...`);
      const simplePayload = { text: `${title}: ${text}` };
      
      const retryResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simplePayload)
      });

      if (retryResponse.ok) {
        console.log(`[Teams] Sucesso no fallback!`);
        return res.json({ success: true, note: "Enviado via fallback simples" });
      }

      return res.status(response.status).json({ 
        error: "Erro na resposta do Teams", 
        status: response.status,
        details: responseText 
      });
    }
  } catch (error: any) {
    console.error("[Teams] Erro na requisição proxy:", error);
    res.status(500).json({ 
      error: "Falha ao conectar com o Teams (Proxy Error)", 
      message: error.message 
    });
  }
});

apiRouter.post("/delete-user", async (req, res) => {
  const { uid, email } = req.body;
  
  if (!uid && !email) {
    return res.status(400).json({ error: "UID ou Email não informado." });
  }

  if (admin.apps.length === 0) {
    return res.status(500).json({ 
      error: "Firebase Admin não inicializado.", 
      details: "A variável FIREBASE_SERVICE_ACCOUNT_KEY pode estar ausente ou malformada no servidor." 
    });
  }

  try {
    if (uid) {
      await admin.auth().deleteUser(uid);
      console.log(`[Auth] Usuário deletado por UID: ${uid}`);
    } else if (email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(userRecord.uid);
        console.log(`[Auth] Usuário deletado por Email: ${email} (UID: ${userRecord.uid})`);
      } catch (getUserError: any) {
        if (getUserError.code === 'auth/user-not-found') {
          console.log(`[Auth] Usuário com email ${email} não encontrado no Auth. Nada para deletar.`);
          return res.json({ success: true, message: "Usuário não encontrado no Auth." });
        }
        throw getUserError;
      }
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error(`[Auth] Erro ao deletar usuário (UID: ${uid}, Email: ${email}):`, error);
    
    res.status(500).json({ 
      error: "Falha ao deletar usuário do Firebase Authentication.",
      message: error.message,
      code: error.code
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
