import { NextResponse } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

const COLLECTION_AUDIT = "target_penjualan_parfum_audit";
const COLLECTION_USERS = "users";

async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const idToken = authorization.substring(7);

  const decodedToken = await adminAuth.verifyIdToken(idToken);

  const uid = decodedToken.uid;

  const userSnapshot = await adminDb.collection(COLLECTION_USERS).doc(uid).get();

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const data = userSnapshot.data() ?? {};

  const role = String(data?.role ?? "").trim();
  const storeId = String(data?.storeId ?? "").trim();
  const cabangId = String(data?.cabangId ?? "").trim();

  const aktif = data?.aktif === true;

  if (!aktif || !role) {
    throw new Error("FORBIDDEN");
  }

  return { uid, role, storeId, cabangId };
}

function cleanString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isValidPeriode(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function errorResponse(error: unknown) {
  const code = error instanceof Error && error.message ? error.message : "";

  if (code === "AUTH_REQUIRED") {
    return NextResponse.json(
      { success: false, message: "Anda harus login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (code === "FORBIDDEN" || code === "USER_PROFILE_NOT_FOUND") {
    return NextResponse.json(
      { success: false, message: "Akses ditolak." },
      { status: 403 },
    );
  }

  console.error("Gagal memproses Audit Parfum:", error);

  return NextResponse.json(
    { success: false, message: "Kesalahan tidak terduga. Silakan coba lagi." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    const role = user.role.toLowerCase();
    if (role !== "store" && role !== "central_cabang" && role !== "central_pusat") {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);

    const periode = cleanString(url.searchParams.get("periode"), 20);
    const storeParam = cleanString(url.searchParams.get("storeId"), 100);

    let storeIds: string[];

    if (role === "store") {
      if (!user.storeId) {
        return NextResponse.json(
          { success: false, message: "Akun Store belum memiliki data toko yang valid." },
          { status: 403 },
        );
      }
      storeIds = [user.storeId];
    } else {
      const requestedStoreId = cleanString(storeParam, 100);
      if (!requestedStoreId) {
        return NextResponse.json(
          { success: false, message: "Toko wajib dipilih." },
          { status: 400 },
        );
      }
      storeIds = [requestedStoreId];
    }

    const results: Record<string, unknown>[] = [];

    for (const storeId of storeIds) {
      let query = adminDb
        .collection(COLLECTION_AUDIT)
        .where("storeId", "==", storeId);

      if (periode) {
        if (!isValidPeriode(periode)) {
          return NextResponse.json(
            { success: false, message: "Periode tidak valid." },
            { status: 400 },
          );
        }
        query = query.where("periode", "==", periode);
      }

      query = query.orderBy("createdAt", "desc");

      const snapshot = await query.get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        results.push({
          id: doc.id,
          aksi: data.aksi,
          storeId: data.storeId,
          cabangId: data.cabangId,
          periode: data.periode,
          itemId: data.itemId,
          employeeId: data.employeeId,
          dataSebelum: data.dataSebelum,
          dataSesudah: data.dataSesudah,
          dibuatOlehUid: data.dibuatOlehUid,
          createdAt: data.createdAt,
        });
      }
    }

    results.sort((a, b) => {
      const ca = String(a.createdAt ?? "");
      const cb = String(b.createdAt ?? "");
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });

    return NextResponse.json({
      success: true,
      audit: results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
