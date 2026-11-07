import { NextResponse } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

const COLLECTION_TARGETS = "target_penjualan_parfum_targets";
const COLLECTION_REALISASI = "target_penjualan_parfum_realisasi";
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

  console.error("Gagal memproses History Parfum:", error);

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

    if (!isValidPeriode(periode)) {
      return NextResponse.json(
        { success: false, message: "Periode wajib diisi dengan format YYYY-MM." },
        { status: 400 },
      );
    }

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

    const history: Record<string, unknown>[] = [];

    for (const storeId of storeIds) {
      const targetSnapshot = await adminDb
        .collection(COLLECTION_TARGETS)
        .where("storeId", "==", storeId)
        .where("periode", "==", periode)
        .where("isActive", "==", true)
        .get();

      for (const targetDoc of targetSnapshot.docs) {
        const targetData = targetDoc.data();

        const realisasiSnapshot = await adminDb
          .collection(COLLECTION_REALISASI)
          .where("storeId", "==", storeId)
          .where("periode", "==", periode)
          .where("itemId", "==", targetData.itemId)
          .get();

        let totalRealisasi = 0;
        const detail: Record<string, unknown>[] = [];

        for (const doc of realisasiSnapshot.docs) {
          const data = doc.data();
          const jumlah = typeof data.jumlah === "number" ? data.jumlah : 0;
          totalRealisasi += jumlah;

          detail.push({
            id: doc.id,
            tanggal: data.tanggal,
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            jumlah,
            satuan: data.satuan,
            lengkap: data.lengkap,
            createdAt: data.createdAt,
          });
        }

        detail.sort((a, b) => {
          const ta = String(a.tanggal ?? "");
          const tb = String(b.tanggal ?? "");
          if (ta !== tb) return ta < tb ? -1 : 1;
          return 0;
        });

        const targetTotal = typeof targetData.targetTotal === "number" ? targetData.targetTotal : 0;
        const progress = targetTotal > 0 ? Math.round((totalRealisasi / targetTotal) * 100) : 0;

        history.push({
          storeId,
          periode,
          itemId: targetData.itemId,
          namaItem: targetData.namaItem,
          satuan: targetData.satuan,
          targetTotal,
          totalRealisasi,
          progress,
          jumlahKaryawanSaatDibuat: targetData.jumlahKaryawanSaatDibuat,
          revisiKe: targetData.revisiKe,
          detail,
        });
      }
    }

    history.sort((a, b) => {
      const na = String(a.namaItem ?? "");
      const nb = String(b.namaItem ?? "");
      return na.localeCompare(nb, "id", { sensitivity: "base" });
    });

    return NextResponse.json({
      success: true,
      periode,
      history,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
