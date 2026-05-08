import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let dbInstance: admin.firestore.Firestore | null = null;

export function getDb(): admin.firestore.Firestore {
  if (dbInstance) return dbInstance;

  if (!admin.apps.length) {
    // Try to initialize if not already done
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } else {
      admin.initializeApp();
    }
  }

  // Get database ID from config
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  let databaseId: string | undefined = undefined;
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    databaseId = config.firestoreDatabaseId;
  }

  dbInstance = admin.firestore(databaseId);
  return dbInstance;
}
