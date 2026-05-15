import express from "express";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import "dotenv/config";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const app = express();
let firestoreDb: any = null;

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Muitas requisições, tente novamente mais tarde." }
});
app.use("/api/", limiter);

app.use(express.json());

// Initialize Firebase Admin
try {
  if (admin.apps.length === 0) {
    let serviceAccount: any = null;
    let databaseId = "(default)";

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
      } catch (parseError) {
        console.error("[Firebase Admin] Erro ao processar FIREBASE_SERVICE_ACCOUNT_KEY:", parseError);
      }
    }

    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let config: any = null;
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      databaseId = config.firestoreDatabaseId || "(default)";
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log("[Firebase Admin] Inicializado com Service Account Key.");
    } else if (config) {
      admin.initializeApp({
        projectId: config.projectId,
      });
      console.log("[Firebase Admin] Inicializado via arquivo de configuração.");
    } else {
      admin.initializeApp();
      console.log("[Firebase Admin] Inicializado com default credentials.");
    }

    // Initialize Firestore with specific databaseId
    firestoreDb = getFirestore(admin.app(), databaseId);
    console.log(`[Firebase Admin] Firestore configurado para database: ${databaseId}`);
  } else {
    firestoreDb = getFirestore(admin.app());
  }
} catch (error) {
  console.error("[Firebase Admin] Erro crítico na inicialização:", error);
}

// Logger de requisições API
app.use("/api", (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Global error handlers for Node.js
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
});

// Middlewares de Segurança
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(`[Auth] Tentativa de acesso sem token: ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Autenticação necessária." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  if (!idToken || idToken === "null") {
    return res.status(401).json({ error: "Token ausente ou inválido." });
  }

  try {
    console.log(`[Auth] Verificando token para ${req.method} ${req.path}`);
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    console.log(`[Auth] Token verificado para: ${decodedToken.email || decodedToken.uid}`);
    
    // Check role in Firestore
    try {
      if (firestoreDb) {
        const userDoc = await firestoreDb.collection("users").doc(decodedToken.uid).get();
        req.userData = userDoc.exists ? userDoc.data() : null;
      } else {
        console.warn("[Auth] firestoreDb não inicializado, pulando busca de userData");
        req.userData = null;
      }
    } catch (firestoreError: any) {
      console.error(`[Auth] Erro ao buscar usuário no Firestore (${decodedToken.uid}):`, firestoreError);
      // Don't block the whole request if Firestore fails, but log it
      // unless it's a critical error. NOT_FOUND (5) here means the database or collection is missing.
      req.userData = null;
    }
    
    const bootstrapAdmins = (process.env.BOOTSTRAP_ADMINS || "").split(",").map(e => e.trim().toLowerCase());
    req.isAdmin = req.userData?.role === "Administrador" || 
                  (decodedToken.email && bootstrapAdmins.includes(decodedToken.email.toLowerCase()));
    
    next();
  } catch (error: any) {
    console.error(`[Auth] Erro na verificação geral (${req.method} ${req.path}):`, error);
    
    let errorMessage = "Sessão inválida ou expirada.";
    let details = error.message || String(error);
    
    // Help identify specific Firebase Auth errors
    if (error.code === 'auth/id-token-expired') {
      errorMessage = "Sua sessão expirou. Por favor, faça login novamente.";
    } else if (error.code === 'auth/argument-error') {
      errorMessage = "Token de autenticação malformado.";
    } else if (error.code === 'auth/internal-error') {
      errorMessage = "Erro interno no servidor de autenticação.";
    }

    res.status(401).json({ 
      error: errorMessage,
      details: details,
      code: error.code
    });
  }
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
};

// Rotas de API
const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    mode: process.env.NODE_ENV || 'development',
    firebaseAdmin: admin.apps.length > 0 ? "initialized" : "not_initialized",
    smtpStatus: process.env.SMTP_HOST ? "configured" : "missing",
    time: new Date().toISOString()
  });
});

apiRouter.post("/send-email", authenticate, async (req, res) => {
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
        let finalError = "Falha ao enviar todos os e-mails.";
        
        // Check if it's the Gmail App Password error
        const firstError = results[0]?.error;
        if (firstError && firstError.includes('534-5.7.9')) {
          finalError = "Erro de Autenticação Gmail: Uma 'Senha de App' é obrigatória porque sua conta tem Verificação em Duas Etapas ativada.";
        }

        return res.status(500).json({ 
          error: finalError,
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

apiRouter.post("/delete-user", authenticate, requireAdmin, async (req, res) => {
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
