import express from "express";
import admin from "firebase-admin";
import "dotenv/config";
import { authenticate, requireAdmin, requireRole } from "./middleware/auth";
import { sendSecureEmail } from "./services/emailService";

const app = express();
const apiRouter = express.Router();

app.use(express.json());

// 1. Health check
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", version: "2.4-professional", auth: admin.apps.length > 0 });
});

// 1.1 Sync/Bootstrap Auth
apiRouter.post("/auth/sync", authenticate, async (req: any, res) => {
  try {
    const userRef = admin.firestore().collection("users").doc(req.user.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists && req.isAdmin) {
      // Auto-create bootstrap admin
      await userRef.set({
        name: req.user.name || req.user.email.split('@')[0],
        email: req.user.email,
        role: 'Administrador',
        status: 'Ativo',
        uid: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ success: true, created: true });
    }
    
    res.json({ success: true, created: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. User Management (Secure)
apiRouter.post("/users/create", authenticate, requireAdmin, async (req: any, res) => {
  const { email, password, name, role } = req.body;
  
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

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      status: 'Ativo',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    });

    // Auditoria
    await admin.firestore().collection("audit-logs").add({
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'USER_CREATE',
      entity: 'users',
      entityId: userRecord.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
    await admin.firestore().collection("users").doc(uid).update({ 
      status: 'Inativo',
      deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Auditoria
    await admin.firestore().collection("audit-logs").add({
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'USER_DELETE',
      entity: 'users',
      entityId: uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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
    const poRef = admin.firestore().collection("purchase-orders").doc(poId);
    
    // Process in a transaction to ensure no double-approval or race condition
    const result = await admin.firestore().runTransaction(async (transaction) => {
      const poDoc = await transaction.get(poRef);
      if (!poDoc.exists) throw new Error("OC não encontrada.");
      
      const poData = poDoc.data()!;
      if (poData.status === 'approved') throw new Error("OC já está aprovada.");

      // Validate approval limit for non-admins
      if (req.userData.role === 'Aprovador') {
        const limit = req.userData.approvalLimit || 0;
        if ((poData.totalAmount || 0) > limit) {
          throw new Error(`Limite insuficiente para aprovação. Seu limite é R$ ${limit}`);
        }
      }

      transaction.update(poRef, {
        status: 'approved',
        approvedBy: req.user.uid,
        approvedByName: req.userData.name,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Auditoria Automática (dentro da transação)
      const auditRef = admin.firestore().collection("audit-logs").doc();
      transaction.set(auditRef, {
        userId: req.user.uid,
        userEmail: req.user.email,
        action: 'APPROVE_PO',
        entity: 'purchase-orders',
        entityId: poId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: { amount: poData.totalAmount, number: poData.number }
      });

      return { success: true };
    });

    res.json(result);
  } catch (error: any) {
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

export default app;
