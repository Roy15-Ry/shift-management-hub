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

// Mode 1 (priority): Vercel / production.
// Kredensial diberikan langsung sebagai secret JSON via environment variable.
const serviceAccountJson =
  process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON

// Mode 2 (fallback): local development.
// Kredensial dibaca dari file service-account JSON lokal.
const serviceAccountFile =
  process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE

let serviceAccount: Record<string, string>

if (serviceAccountJson) {
  serviceAccount = JSON.parse(serviceAccountJson)
} else if (serviceAccountFile) {
  const serviceAccountPath = path.join(
    process.cwd(),
    serviceAccountFile,
  )

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "File Firebase Admin Service Account tidak ditemukan.",
    )
  }

  serviceAccount = JSON.parse(
    fs.readFileSync(
      serviceAccountPath,
      "utf8",
    ),
  )
} else {
  throw new Error(
    "Kredensial Firebase Admin belum dikonfigurasi. " +
      "Set FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON (Vercel/production) " +
      "atau FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE (local development).",
  )
}

if (
  !serviceAccount.project_id ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  throw new Error(
    "Service Account Firebase Admin tidak lengkap. " +
      "Diperlukan project_id, client_email, dan private_key.",
  )
}

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