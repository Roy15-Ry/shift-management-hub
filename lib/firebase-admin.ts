import fs from "fs"
import path from "path"

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app"

import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

// ============================================================
// FIREBASE ADMIN SERVICE ACCOUNT
// ============================================================

const serviceAccountFile =
  process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE

if (!serviceAccountFile) {
  throw new Error(
    "FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE belum diatur.",
  )
}

const serviceAccountPath = path.join(
  process.cwd(),
  serviceAccountFile,
)

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    "File Firebase Admin Service Account tidak ditemukan.",
  )
}

const serviceAccount = JSON.parse(
  fs.readFileSync(
    serviceAccountPath,
    "utf8",
  ),
)

// ============================================================
// INITIALIZE FIREBASE ADMIN
// ============================================================

const firebaseAdminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      })

// ============================================================
// EXPORT
// ============================================================

export const adminAuth =
  getAuth(firebaseAdminApp)

export const adminDb =
  getFirestore(firebaseAdminApp)