import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app"

import { getAuth } from "firebase-admin/auth"
import fs from "node:fs"
import path from "node:path"
import { getFirestore } from "firebase-admin/firestore"

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

let cachedApp: ReturnType<typeof getApps>[number] | null =
  null

let initError: Error | null = null

function loadServiceAccount(): ServiceAccount {
  const serviceAccountJson =
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON

  if (serviceAccountJson) {
    return JSON.parse(
      serviceAccountJson,
    ) as ServiceAccount
  }

  const serviceAccountFile =
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE

  if (serviceAccountFile) {
    const serviceAccountPath = path.join(
      process.cwd(),
      serviceAccountFile,
    )

    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(
        "File Firebase Admin Service Account tidak ditemukan.",
      )
    }

    return JSON.parse(
      fs.readFileSync(
        serviceAccountPath,
        "utf8",
      ),
    ) as ServiceAccount
  }

  throw new Error(
    "Kredensial Firebase Admin belum dikonfigurasi. " +
      "Set FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON (Vercel/production) " +
      "atau FIREBASE_ADMIN_SERVICE_ACCOUNT_FILE (local development).",
  )
}

function getFirebaseApp() {
  if (cachedApp) {
    return cachedApp
  }

  if (initError) {
    throw initError
  }

  try {
    const serviceAccount = loadServiceAccount()

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

    cachedApp = firebaseAdminApp

    return firebaseAdminApp
  } catch (error) {
    initError = error as Error

    throw initError
  }
}

export const adminAuth = new Proxy(
  {} as ReturnType<typeof getAuth>,
  {
    get(_target, property) {
      const auth = getAuth(getFirebaseApp())

      const value = (auth as unknown as Record<PropertyKey, unknown>)[
        property
      ]

      return typeof value === "function"
        ? value.bind(auth)
        : value
    },
  },
)

export const adminDb = new Proxy(
  {} as ReturnType<typeof getFirestore>,
  {
    get(_target, property) {
      const db = getFirestore(getFirebaseApp())

      const value = (db as unknown as Record<PropertyKey, unknown>)[
        property
      ]

      return typeof value === "function"
        ? value.bind(db)
        : value
    },
  },
)
