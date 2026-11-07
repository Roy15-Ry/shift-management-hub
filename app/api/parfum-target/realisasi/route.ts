import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

const COLLECTION_REALISASI = "target_penjualan_parfum_realisasi";
const COLLECTION_AUDIT = "target_penjualan_parfum_audit";
const COLLECTION_USERS = "users";
const COLLECTION_EMPLOYEES = "employees";
const COLLECTION_TARGETS = "target_penjualan_parfum_targets";

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
  const nama = String(data?.nama ?? data?.email ?? "").trim();

  const aktif = data?.aktif === true;

  if (!aktif || !role) {
    throw new Error("FORBIDDEN");
  }

  return { uid, role, storeId, cabangId, nama };
}

function cleanString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isValidDateISO(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
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

  console.error("Gagal memproses Realisasi Parfum:", error);

  return NextResponse.json(
    { success: false, message: "Kesalahan tidak terduga. Silakan coba lagi." },
    { status: 500 },
  );
}

async function writeAuditEntry({
  aksi,
  storeId,
  cabangId,
  periode,
  itemId,
  employeeId,
  dataSebelum,
  dataSesudah,
  userUid,
}: {
  aksi: string;
  storeId: string;
  cabangId: string;
  periode: string;
  itemId: string | null;
  employeeId: string | null;
  dataSebelum: unknown;
  dataSesudah: unknown;
  userUid: string;
}): Promise<void> {
  await adminDb.collection(COLLECTION_AUDIT).add({
    aksi,
    storeId,
    cabangId,
    periode,
    itemId,
    employeeId,
    dataSebelum,
    dataSesudah,
    dibuatOlehUid: userUid,
    createdAt: FieldValue.serverTimestamp(),
  });
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
    const itemParam = cleanString(url.searchParams.get("itemId"), 100);
    const employeeParam = cleanString(url.searchParams.get("employeeId"), 100);
    const tanggalParam = cleanString(url.searchParams.get("tanggal"), 20);

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

    const results: Record<string, unknown>[] = [];

    for (const storeId of storeIds) {
      let query = adminDb
        .collection(COLLECTION_REALISASI)
        .where("storeId", "==", storeId)
        .where("periode", "==", periode);

      if (itemParam) {
        query = query.where("itemId", "==", itemParam);
      }

      if (employeeParam) {
        query = query.where("employeeId", "==", employeeParam);
      }

      if (tanggalParam) {
        query = query.where("tanggal", "==", tanggalParam);
      }

      const snapshot = await query.get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        results.push({
          id: doc.id,
          storeId: data.storeId,
          cabangId: data.cabangId,
          periode: data.periode,
          itemId: data.itemId,
          namaItem: data.namaItem,
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          tanggal: data.tanggal,
          jumlah: data.jumlah,
          satuan: data.satuan,
          lengkap: data.lengkap,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      }
    }

    results.sort((a, b) => {
      const ta = String(a.tanggal ?? "");
      const tb = String(b.tanggal ?? "");
      if (ta !== tb) return ta < tb ? -1 : 1;
      const ca = String(a.createdAt ?? "");
      const cb = String(b.createdAt ?? "");
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });

    return NextResponse.json({
      success: true,
      periode,
      realisasi: results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        { success: false, message: "Hanya akun Store yang dapat mencatat realisasi parfum." },
        { status: 403 },
      );
    }

    const storeId = user.storeId;
    const cabangId = user.cabangId;

    if (!storeId || !cabangId) {
      return NextResponse.json(
        { success: false, message: "Akun Store belum memiliki data toko/cabang yang valid." },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, message: "Body request tidak valid." },
        { status: 400 },
      );
    }

    const tanggal = cleanString(body?.tanggal, 20);
    const itemId = cleanString(body?.itemId, 100);
    const satuan = cleanString(body?.satuan, 10);
    const lengkap = body?.lengkap === true;
    const entriesRaw = body?.entries;
    const singleEntry = {
      employeeId: cleanString(body?.employeeId, 200),
      jumlah: body?.jumlah,
    };

    if (!isValidDateISO(tanggal) || !itemId) {
      return NextResponse.json(
        { success: false, message: "Tanggal dan Item wajib diisi dengan benar." },
        { status: 400 },
      );
    }

    if (satuan !== "ML") {
      return NextResponse.json(
        { success: false, message: 'Satuan hanya boleh "ML".' },
        { status: 400 },
      );
    }

    // Build entries list (support both batch and single-entry formats)
    const entries: { employeeId: string; jumlah: unknown }[] = [];

    if (Array.isArray(entriesRaw) && entriesRaw.length > 0) {
      for (const e of entriesRaw) {
        const empId = cleanString((e as Record<string, unknown>)?.employeeId, 200);
        const jml = (e as Record<string, unknown>)?.jumlah;
        if (empId) {
          entries.push({ employeeId: empId, jumlah: jml });
        }
      }
    } else if (singleEntry.employeeId) {
      entries.push(singleEntry);
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, message: "Minimal satu data karyawan wajib diisi." },
        { status: 400 },
      );
    }

    // Validate all entries
    const validatedEntries: { employeeId: string; jumlah: number }[] = [];

    for (const e of entries) {
      const num = Number(e.jumlah);
      if (e.jumlah === "" || e.jumlah === null || e.jumlah === undefined) {
        // Kosong = belum diinput, skip validation but mark as empty
        validatedEntries.push({ employeeId: e.employeeId, jumlah: NaN });
        continue;
      }
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json(
          { success: false, message: `Jumlah untuk ${e.employeeId} harus berupa angka yang valid.` },
          { status: 400 },
        );
      }
      const rounded = Math.round(num * 100) / 100;
      validatedEntries.push({ employeeId: e.employeeId, jumlah: rounded });
    }

    const periode = `${tanggal.slice(0, 4)}-${tanggal.slice(5, 7)}`;

    const targetSnap = await adminDb
      .collection(COLLECTION_TARGETS)
      .where("storeId", "==", storeId)
      .where("periode", "==", periode)
      .where("itemId", "==", itemId)
      .where("isActive", "==", true)
      .get();

    if (targetSnap.empty) {
      return NextResponse.json(
        { success: false, message: "Target item belum dibuat untuk periode ini." },
        { status: 400 },
      );
    }

    const targetData = targetSnap.docs[0].data();
    const namaItem = String(targetData?.namaItem ?? "-");

    const batch = adminDb.batch();
    let processed = 0;

    for (const entry of validatedEntries) {
      const empId = entry.employeeId;

      // Verify employee belongs to store
      const empSnap = await adminDb.collection(COLLECTION_EMPLOYEES).doc(empId).get();
      if (!empSnap.exists) {
        continue;
      }
      const empData = empSnap.data();
      if (String(empData?.storeId ?? "") !== storeId) {
        continue;
      }

      const empName = String(empData?.name ?? empData?.nama ?? "-");

      // Check for existing record (upsert by storeId+periode+itemId+employeeId+tanggal)
      const existingSnap = await adminDb
        .collection(COLLECTION_REALISASI)
        .where("storeId", "==", storeId)
        .where("periode", "==", periode)
        .where("itemId", "==", itemId)
        .where("employeeId", "==", empId)
        .where("tanggal", "==", tanggal)
        .get();

      const jumlah = Number.isFinite(entry.jumlah) ? entry.jumlah : null;
      const empNama = empName;

      if (!existingSnap.empty) {
        // Update existing
        const existingDoc = existingSnap.docs[0];
        batch.update(existingDoc.ref, {
          jumlah,
          satuan,
          lengkap,
          employeeName: empNama,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Create new
        const newRef = adminDb.collection(COLLECTION_REALISASI).doc();
        batch.set(newRef, {
          storeId,
          cabangId,
          periode,
          itemId,
          namaItem,
          employeeId: empId,
          employeeName: empNama,
          tanggal,
          jumlah,
          satuan,
          lengkap,
          createdBy: { uid: user.uid, nama: user.nama },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      processed++;
    }

    await batch.commit();

    return NextResponse.json(
      {
        success: true,
        processed,
        message: `Realisasi parfum berhasil disimpan (${processed} karyawan).`,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        { success: false, message: "Hanya akun Store yang dapat menghapus realisasi parfum." },
        { status: 403 },
      );
    }

    const storeId = user.storeId;

    if (!storeId) {
      return NextResponse.json(
        { success: false, message: "Akun Store belum memiliki data toko yang valid." },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, message: "Body request tidak valid." },
        { status: 400 },
      );
    }

    const id = cleanString(body?.id, 200);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Data realisasi tidak valid." },
        { status: 400 },
      );
    }

    const docRef = adminDb.collection(COLLECTION_REALISASI).doc(id);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      return NextResponse.json(
        { success: false, message: "Realisasi tidak ditemukan." },
        { status: 404 },
      );
    }

    const current = docSnapshot.data();

    if (String(current?.storeId ?? "") !== storeId) {
      return NextResponse.json(
        { success: false, message: "Anda hanya dapat menghapus realisasi pada toko Anda." },
        { status: 403 },
      );
    }

    const periode = String(current?.periode ?? "");
    const itemId = String(current?.itemId ?? null);
    const employeeId = String(current?.employeeId ?? null);

    await docRef.delete();

    await writeAuditEntry({
      aksi: "HAPUS_REALISASI",
      storeId,
      cabangId: String(current?.cabangId ?? ""),
      periode,
      itemId: itemId || null,
      employeeId: employeeId || null,
      dataSebelum: current,
      dataSesudah: null,
      userUid: user.uid,
    });

    return NextResponse.json({
      success: true,
      message: "Realisasi parfum berhasil dihapus. Data tidak dapat dikembalikan.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
