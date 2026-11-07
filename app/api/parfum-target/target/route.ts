import { NextResponse } from "next/server";
import {
  DocumentReference,
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

import type {
  ParfumUser,
  ParfumTarget,
  ParfumAllocation,
  ParfumTargetRequest,
  ParfumTargetInput,
} from "@/lib/parfum-types";

import {
  allocateML,
  validateML,
} from "@/lib/parfum-target";

const COLLECTION_TARGETS = "target_penjualan_parfum_targets";
const COLLECTION_ALLOCATIONS = "target_penjualan_parfum_allocations";
const COLLECTION_AUDIT = "target_penjualan_parfum_audit";
const COLLECTION_EMPLOYEES = "employees";
const COLLECTION_USERS = "users";
const MAX_ITEMS = 20;

type TargetUser = {
  uid: string;
  role: string;
  storeId: string;
  cabangId: string;
  nama: string;
};

async function getAuthenticatedUser(request: Request): Promise<TargetUser> {
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

  return {
    uid,
    role,
    storeId,
    cabangId,
    nama,
  };
}

function cleanString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isValidPeriode(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function sanitizeDocId(value: string): string {
  return value.replace(/[^\w.\-]/g, "_");
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

  console.error("Gagal memproses Target Penjualan Parfum:", error);

  return NextResponse.json(
    { success: false, message: "Kesalahan tidak terduga. Silakan coba lagi." },
    { status: 500 },
  );
}

async function getActiveEmployees(storeId: string): Promise<{
  id: string;
  name: string;
}[]> {
  const snapshot = await adminDb
    .collection(COLLECTION_EMPLOYEES)
    .where("storeId", "==", storeId)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data?.name ?? data?.nama ?? "-"),
        aktif: data?.aktif === true,
      };
    })
    .filter((e) => e.aktif === true);
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

function toTargetUpserts(
  body: Record<string, unknown>,
): { periode: string; items: ParfumTargetInput[] } | { error: string } {
  const periode = cleanString(body?.periode, 20);

  if (!isValidPeriode(periode)) {
    return { error: "Periode tidak valid." };
  }

  const rawItems = body?.items;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "Item tidak boleh kosong." };
  }

  if (rawItems.length > MAX_ITEMS) {
    return { error: `Maksimal ${MAX_ITEMS} item aktif per toko per bulan.` };
  }

  const items: ParfumTargetInput[] = [];
  const seenNames = new Set<string>();

  for (const rawItem of rawItems) {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : null;

    if (!item) {
      return { error: "Data item tidak valid." };
    }

    const namaItem = cleanString(item?.namaItem, 150);

    if (!namaItem) {
      return { error: "Nama item wajib diisi." };
    }

    const upperName = namaItem.toUpperCase();
    if (seenNames.has(upperName)) {
      return { error: `Nama item "${namaItem}" duplikasi dalam satu penyimpanan.` };
    }
    seenNames.add(upperName);

    const satuan = cleanString(item?.satuan, 10);

    if (satuan !== "ML") {
      return { error: 'Satuan hanya boleh "ML".' };
    }

    const rawTarget = item?.targetTotal;
    let targetTotal: number;

    const parsed = validateML(rawTarget);
    if (parsed === null) {
      return { error: "Target ML maksimal 2 angka desimal." };
    }
    targetTotal = parsed;

    const itemId = cleanString(item?.itemId, 100) || "";

    items.push({
      itemId,
      namaItem,
      satuan,
      targetTotal,
    });
  }

  return { periode, items };
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

    const results: Record<string, unknown>[] = [];

    for (const storeId of storeIds) {
      const snapshot = await adminDb
        .collection(COLLECTION_TARGETS)
        .where("storeId", "==", storeId)
        .where("periode", "==", periode)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.isActive === false) continue;
        results.push({
          id: doc.id,
          storeId: data.storeId,
          cabangId: data.cabangId,
          periode: data.periode,
          itemId: data.itemId,
          namaItem: data.namaItem,
          satuan: data.satuan,
          targetTotal: data.targetTotal,
          jumlahKaryawanSaatDibuat: data.jumlahKaryawanSaatDibuat,
          revisiKe: data.revisiKe,
          isActive: data.isActive,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          diperbaruiOleh: data.diperbaruiOleh,
        });
      }
    }

    results.sort((a, b) => {
      const na = String(a.namaItem ?? "");
      const nb = String(b.namaItem ?? "");
      return na.localeCompare(nb, "id", { sensitivity: "base" });
    });

    return NextResponse.json({
      success: true,
      periode,
      targets: results,
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
        { success: false, message: "Hanya akun Store yang dapat mengatur target parfum." },
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

    const parsed = toTargetUpserts(body);

    if ("error" in parsed) {
      return NextResponse.json({ success: false, message: parsed.error }, { status: 400 });
    }

    const periode = parsed.periode;
    const items = parsed.items;

    const employees = await getActiveEmployees(storeId);

    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada karyawan aktif untuk dialokasikan target." },
        { status: 400 },
      );
    }

    const docBase = sanitizeDocId(storeId);
    const batch = adminDb.batch();
    const processedTargets: { itemId: string; namaItem: string; revisiKe: number }[] = [];

    for (const input of items) {
      let itemId = input.itemId;
      let revisiKe = 1;
      let isNewItem = true;
      let existingTarget: ParfumTarget | null = null;

      if (itemId) {
        const existingRef = adminDb.collection(COLLECTION_TARGETS).doc(itemId);
        const existingSnap = await existingRef.get();

        if (existingSnap.exists) {
          const data = existingSnap.data() as ParfumTarget;
          if (
            data.storeId === storeId &&
            data.periode === periode &&
            data.isActive === true
          ) {
            existingTarget = { id: existingSnap.id, ...data };
            itemId = existingSnap.id;
            revisiKe = (existingTarget.revisiKe ?? 0) + 1;
            isNewItem = false;
            batch.update(existingRef, { isActive: false, updatedAt: FieldValue.serverTimestamp() });
          }
        }
      }

      if (!itemId) {
        itemId = `${docBase}_${sanitizeDocId(periode)}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }

      const allocations = allocateML(input.targetTotal, employees.length);

      const targetRef = adminDb.collection(COLLECTION_TARGETS).doc(itemId);

      const targetData: ParfumTarget = {
        storeId,
        cabangId,
        periode,
        itemId,
        namaItem: input.namaItem,
        satuan: input.satuan,
        targetTotal: input.targetTotal,
        jumlahKaryawanSaatDibuat: employees.length,
        revisiKe,
        isActive: true,
        createdBy: existingTarget ? existingTarget.createdBy : { uid: user.uid, nama: user.nama },
        createdAt: existingTarget ? existingTarget.createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        diperbaruiOleh: { uid: user.uid, nama: user.nama },
      };

      batch.set(targetRef, targetData, { merge: true });

      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        const allocationId = `${docBase}_${sanitizeDocId(periode)}_${itemId}_${sanitizeDocId(emp.id)}`;
        const allocationRef = adminDb.collection(COLLECTION_ALLOCATIONS).doc(allocationId);

        const allocationData: ParfumAllocation = {
          storeId,
          cabangId,
          periode,
          itemId,
          employeeId: emp.id,
          employeeName: emp.name,
          targetIndividual: allocations[i],
          revisiKe,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        batch.set(allocationRef, allocationData, { merge: true });
      }

      processedTargets.push({ itemId, namaItem: input.namaItem, revisiKe });
    }

    await batch.commit();

    await writeAuditEntry({
      aksi: processedTargets.some((t) => t.revisiKe > 1) ? "REVISI_TARGET" : "BUAT_TARGET",
      storeId,
      cabangId,
      periode,
      itemId: null,
      employeeId: null,
      dataSebelum: null,
      dataSesudah: processedTargets,
      userUid: user.uid,
    });

    return NextResponse.json({
      success: true,
      periode,
      processed: processedTargets.length,
      targets: processedTargets,
      message: "Target parfum berhasil disimpan.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        { success: false, message: "Hanya akun Store yang dapat menghapus target parfum." },
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

    const periode = cleanString(body?.periode, 20);
    const itemId = cleanString(body?.itemId, 100);

    if (!isValidPeriode(periode) || !itemId) {
      return NextResponse.json(
        { success: false, message: "Data target yang akan dihapus tidak valid." },
        { status: 400 },
      );
    }

    const targetRef = adminDb.collection(COLLECTION_TARGETS).doc(itemId);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Target tidak ditemukan." },
        { status: 404 },
      );
    }

    const current = targetSnap.data() as ParfumTarget;

    if (current.storeId !== storeId) {
      return NextResponse.json(
        { success: false, message: "Anda hanya dapat menghapus target pada toko Anda." },
        { status: 403 },
      );
    }

    if (current.periode !== periode) {
      return NextResponse.json(
        { success: false, message: "Periode tidak cocok dengan target." },
        { status: 400 },
      );
    }

    const batch = adminDb.batch();

    batch.update(targetRef, { isActive: false, updatedAt: FieldValue.serverTimestamp() });

    const allocSnapshot = await adminDb
      .collection(COLLECTION_ALLOCATIONS)
      .where("storeId", "==", storeId)
      .where("periode", "==", periode)
      .where("itemId", "==", itemId)
      .get();

    for (const doc of allocSnapshot.docs) {
      batch.update(doc.ref, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    await writeAuditEntry({
      aksi: "HAPUS_TARGET",
      storeId,
      cabangId,
      periode,
      itemId,
      employeeId: null,
      dataSebelum: current,
      dataSesudah: null,
      userUid: user.uid,
    });

    return NextResponse.json({
      success: true,
      deleted: 1,
      message: "Target parfum berhasil dihapus. Histori tetap tersimpan.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
