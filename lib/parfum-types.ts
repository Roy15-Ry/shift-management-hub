export type ParfumSatuan = "PCS" | "ML";

export type ParfumAksi = "BUAT_TARGET" | "REVISI_TARGET" | "HAPUS_TARGET" | "HAPUS_REALISASI";

export interface ParfumUser {
  uid: string;
  role: string;
  storeId: string;
  cabangId: string;
  nama: string;
}

export interface ParfumTarget {
  id?: string;
  storeId: string;
  cabangId: string;
  periode: string;
  itemId: string;
  namaItem: string;
  satuan: ParfumSatuan;
  targetTotal: number;
  jumlahKaryawanSaatDibuat: number;
  revisiKe: number;
  isActive: boolean;
  createdBy: { uid: string; nama: string };
  createdAt: unknown;
  updatedAt: unknown;
  diperbaruiOleh: { uid: string; nama: string } | null;
}

export interface ParfumAllocation {
  id?: string;
  storeId: string;
  cabangId: string;
  periode: string;
  itemId: string;
  employeeId: string;
  employeeName: string;
  targetIndividual: number;
  revisiKe: number;
  isActive?: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ParfumRealisasi {
  id: string;
  storeId: string;
  cabangId: string;
  periode: string;
  itemId: string;
  namaItem: string;
  employeeId: string;
  employeeName: string;
  tanggal: string;
  jumlah: number;
  satuan: ParfumSatuan;
  lengkap: boolean;
  createdBy: { uid: string; nama: string };
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ParfumAudit {
  id: string;
  aksi: ParfumAksi;
  storeId: string;
  cabangId: string;
  periode: string;
  itemId: string | null;
  employeeId: string | null;
  dataSebelum: unknown;
  dataSesudah: unknown;
  dibuatOlehUid: string;
  createdAt: unknown;
}

export interface ParfumTargetInput {
  itemId?: string;
  namaItem: string;
  satuan: ParfumSatuan;
  targetTotal: number;
}

export interface ParfumTargetRequest {
  periode: string;
  items: ParfumTargetInput[];
}

export interface ParfumRealisasiInput {
  tanggal: string;
  employeeId: string;
  itemId: string;
  jumlah: number;
  satuan: ParfumSatuan;
  lengkap: boolean;
}
