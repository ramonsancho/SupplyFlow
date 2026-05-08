import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// Self-initializing on module load
try {
  if (!admin.apps.length) {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log("[Firebase Lib] Initialized Admin with project:", firebaseConfig.projectId);
    } else {
      admin.initializeApp();
      console.log("[Firebase Lib] Initialized Admin with default credentials");
    }
  }
} catch (err) {
  console.error("[Firebase Lib] Error initializing Firebase Admin:", err);
}

let dbInstance: admin.firestore.Firestore | null = null;

export function getDb(): admin.firestore.Firestore {
  if (dbInstance) return dbInstance;

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let databaseId: string | undefined = undefined;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      databaseId = config.firestoreDatabaseId;
    }

    if (databaseId && databaseId !== '(default)') {
      console.log("[Firebase Lib] Using database:", databaseId);
      dbInstance = getFirestore(databaseId) as any;
    } else {
      console.log("[Firebase Lib] Using default database");
      dbInstance = getFirestore() as any;
    }

    return dbInstance!;
  } catch (err) {
    console.error("[Firebase Lib] Fatal error in getDb:", err);
    throw err;
  }
}
