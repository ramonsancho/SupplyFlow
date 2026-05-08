import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { getDb } from '../lib/firebase';

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  userData?: any;
  isAdmin?: boolean;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    
    // Check for bootstrap admin via env if needed, but prefer Firestore
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();
    const isBootstrap = bootstrapEmail && decodedToken.email?.toLowerCase().trim() === bootstrapEmail && decodedToken.email_verified;

    // Check status in Firestore
    const userDoc = await getDb().collection("users").doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      if (isBootstrap) {
        // Special case: allow bootstrap admin to perform initial actions (like creating themselves)
        req.userData = { role: 'Administrador', name: decodedToken.name || 'Bootstrap Admin', status: 'Ativo' };
        req.isAdmin = true;
        return next();
      }
      return res.status(403).json({ error: "Usuário não registrado no sistema." });
    }

    const userData = userDoc.data();
    if (userData?.status !== 'Ativo') {
      return res.status(403).json({ error: "Sua conta está inativa. Entre em contato com o administrador." });
    }

    req.userData = userData;
    // Strictly use Firestore role
    req.isAdmin = userData.role === 'Administrador' || isBootstrap;
    
    next();
  } catch (error) {
    console.error("[Auth Middleware] Token error:", error);
    res.status(401).json({ error: "Token de acesso inválido." });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.isAdmin) return next();
    if (req.userData && roles.includes(req.userData.role)) return next();
    
    return res.status(403).json({ error: "Você não tem permissão para realizar esta ação." });
  };
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: "Operação restrita a administradores." });
  }
  next();
};
