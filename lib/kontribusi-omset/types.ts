export type KontribusiOmsetRole = 'store' | 'central_cabang' | 'central_pusat';
export type KontribusiOmsetStatus = 'LENGKAP' | 'BELUM_LENGKAP';
export type KontribusiOmsetEmployeeInput = { employeeId: string; employeeNameSnapshot: string; visitorValue?: number | null; visitorConfirmed?: boolean; revenueValue?: number | null; revenueConfirmed?: boolean; };
export type KontribusiOmsetReportEmployee = { employeeId: string; employeeNameSnapshot: string; visitorValue: number | null; visitorConfirmed: boolean; revenueValue: number | null; revenueConfirmed: boolean; };
export type KontribusiOmsetReportDoc = { storeId: string; cabangId: string; reportDate: string; period: string; status: KontribusiOmsetStatus; employeeCountSnapshot: number; totalVisitor: number; totalTransactions: number; totalRevenue: number; averageRevenuePerTransaction: number; employees: KontribusiOmsetReportEmployee[]; createdBy: string; createdAt: any; updatedBy: string; updatedAt: any; };
export function getKontribusiOmsetReportId(storeId: string, reportDate: string): string { const s = String(storeId ?? '').trim(); const d = String(reportDate ?? '').trim(); if (!s || !d) throw new Error('INVALID_REPORT_ID_INPUT'); return s + '__' + d; }

// TARGET OMSET (aditif — tidak mengubah tipe laporan harian di atas)

export type KontribusiOmsetTargetDoc = { storeId: string; cabangId: string; periode: string; employeeId: string; targetBulanan: number; employeeCountSnapshot: number | null; createdBy: string; createdAt: any; updatedBy: string; updatedAt: any; };

export type KontribusiOmsetTargetHistoryDoc = { storeId: string; cabangId: string; periode: string; employeeId: string; targetSebelum: number | null; targetSesudah: number; actorUid: string; actorRole: string; actorNama: string; alasan: string; createdAt: any; };

export type KontribusiOmsetTargetRow = { targetId: string; storeId: string; cabangId: string; periode: string; employeeId: string; targetTersedia: boolean; targetBulanan: number | null; employeeCountSnapshot: number | null; updatedBy: string; updatedAt: string | null; };

function sanitizeKontribusiTargetId(value: string): string { return value.replace(/[^\w.\-]/g, '_'); }

export function getKontribusiOmsetTargetId(storeId: string, periode: string): string { const s = String(storeId ?? '').trim(); const p = String(periode ?? '').trim(); if (!s || !/^\d{4}-\d{2}$/.test(p)) throw new Error('INVALID_TARGET_ID_INPUT'); return sanitizeKontribusiTargetId(s) + '__' + p; }

export function getKontribusiOmsetTargetIdPerEmployee(storeId: string, periode: string, employeeId: string): string { const s = String(storeId ?? '').trim(); const p = String(periode ?? '').trim(); const e = String(employeeId ?? '').trim(); if (!s || !/^\d{4}-\d{2}$/.test(p) || !e) throw new Error('INVALID_TARGET_ID_INPUT'); return sanitizeKontribusiTargetId(s) + '__' + p + '__' + sanitizeKontribusiTargetId(e); }