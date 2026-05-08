import express from "express";
import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import "dotenv/config";
import { authenticate, requireAdmin, requireRole } from "./middleware/auth";
import { sendSecureEmail } from "./services/emailService";
import { getDb } from "./lib/firebase";

const app = express();
const apiRouter = express.Router();

app.use(express.json());

// 1. Health check
apiRouter.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    version: "3.1-enterprise", 
    auth: admin.apps.length > 0,
    db: !!getDb()
  });
});

// 1.1 Sync/Bootstrap Auth
apiRouter.post("/auth/sync", authenticate, async (req: any, res) => {
  try {
    const userRef = getDb().collection("users").doc(req.user.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists && req.isAdmin) {
      // Auto-create bootstrap admin
      const email = req.user.email || "";
      const name = req.user.name || (email ? email.split('@')[0] : "Admin");
      
      await userRef.set({
        name,
        email,
        role: 'Administrador',
        status: 'Ativo',
        uid: req.user.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      console.log(`[API] Bootstrap admin created for ${email}`);
      return res.json({ success: true, created: true });
    }
    
    res.json({ success: true, created: false });
  } catch (error: any) {
    console.error("[API] Auth Sync Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. User Management (Secure)
apiRouter.post("/users/create", authenticate, requireAdmin, async (req: any, res) => {
  const { email, password, name, role, approvalLimit } = req.body;
  
  if (!email || !name || !role) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes." });
  }

  const allowedRoles = ['Administrador', 'Comprador', 'Aprovador', 'Requisitante'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: "Papel de usuário inválido." });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: password || Math.random().toString(36).slice(-10) + "!", // Random password if none provided
      displayName: name,
    });

    await getDb().collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      status: 'Ativo',
      approvalLimit: approvalLimit || 0,
      createdAt: Timestamp.now(),
      createdBy: req.user.uid
    });

    // Auditoria
    await getDb().collection("audit-logs").add({
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'USER_CREATE',
      entity: 'users',
      entityId: userRecord.uid,
      timestamp: Timestamp.now(),
      details: { email, role }
    });

    res.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/users/delete", authenticate, requireAdmin, async (req: any, res) => {
  const { uid } = req.body;
  
  if (uid === req.user.uid) {
    return res.status(400).json({ error: "Você não pode deletar sua própria conta." });
  }

  try {
    await admin.auth().deleteUser(uid);
    await getDb().collection("users").doc(uid).update({ 
      status: 'Inativo',
      deactivatedAt: Timestamp.now()
    });

    // Auditoria
    await getDb().collection("audit-logs").add({
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'USER_DELETE',
      entity: 'users',
      entityId: uid,
      timestamp: Timestamp.now()
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Purchase Order Approval (Secure Workflow)
apiRouter.post("/po/approve", authenticate, requireRole(['Administrador', 'Aprovador']), async (req: any, res) => {
  const { poId } = req.body;
  if (!poId) return res.status(400).json({ error: "ID da OC é obrigatório." });

  try {
    console.log(`[API] Approving PO ${poId} by ${req.user.uid} (${req.userData.role})`);
    
    const db = getDb();
    const poRef = db.collection("purchase-orders").doc(poId);
    
    console.log(`[API] Starting transaction for PO ${poId}`);
    
    // Process in a transaction to ensure no double-approval or race condition
    const result = await db.runTransaction(async (transaction) => {
      console.log(`[API] Transaction running for PO ${poId}`);
      const poDoc = await transaction.get(poRef);
      if (!poDoc.exists) throw new Error("OC não encontrada.");
      
      const poData = poDoc.data();
      if (!poData) throw new Error("A OC existe mas os dados estão vazios.");

      console.log(`[API] PO Data status: ${poData.status}`);
      if (poData.status === 'approved') throw new Error("OC já está aprovada.");

      // Validate approval limit for non-admins
      const userRole = req.userData?.role;
      if (userRole === 'Aprovador') {
        const limit = Number(req.userData.approvalLimit || 0);
        const poTotal = Number(poData.totalAmount || 0);
        console.log(`[API] Approver limit: ${limit}, PO total: ${poTotal}`);
        if (poTotal > limit) {
          throw new Error(`Limite insuficiente para aprovação. Seu limite é R$ ${limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        }
      }

      const now = Timestamp.now();
      
      transaction.update(poRef, {
        status: 'approved',
        approvedBy: req.user?.uid || 'unknown',
        approvedByName: req.userData?.name || 'Unknown',
        approvedAt: now,
        updatedAt: now
      });

      // Auditoria Automática (dentro da transação)
      const auditRef = db.collection("audit-logs").doc();
      transaction.set(auditRef, {
        userId: req.user?.uid || 'unknown',
        userEmail: req.user?.email || 'unknown',
        action: 'APPROVE_PO',
        entity: 'purchase-orders',
        entityId: poId,
        timestamp: now,
        details: { 
          amount: poData.totalAmount, 
          number: poData.number,
          role: userRole
        }
      });

      return { success: true };
    });

    console.log(`[API] PO ${poId} approved successfully`);
    res.json(result);
  } catch (error: any) {
    console.error(`[API] PO Approve Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Secure Email API
apiRouter.post("/send-email", authenticate, requireRole(['Administrador', 'Comprador']), async (req: any, res) => {
  const { to, subject, templateName, context } = req.body;
  
  if (!to || !templateName) {
    return res.status(400).json({ error: "Destinatário e template são obrigatórios." });
  }

  try {
    const info = await sendSecureEmail({
      to,
      subject,
      templateName,
      context,
      userId: req.user.uid
    });
    res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/", apiRouter);

// Catch-all para rotas não encontradas
app.all("*", (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.path}` });
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[API Global Error]:", err);
  res.status(err.status || 500).json({ 
    error: err.message || "Erro interno do servidor",
    path: req.path
  });
});

export default app;
