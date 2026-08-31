"use client"

import { cn } from "@/lib/utils"

// ============================================================
// TABEL REKAP JUMLAH MASUK BULANAN
//
// Komponen presentasi murni: menerima baris rekap + label bulan.
// Warna kolom selaras dengan design system status shift:
//   PAGI  -> hijau, SIANG -> biru, LIBUR/CUTI/SAKIT-IZIN -> merah
//   TOTAL -> aksen. Layout responsive dengan horizontal scroll.
// ============================================================

export type RekapRowProps = {
  employeeId: string
  name: string
  pagi: number
  siang: number
  libur: number
  cuti: number
  sakitIzin: number
  total: number
}

export function RekapJumlahMasukTable(props: {
  title: string
  rows: RekapRowProps[]
}) {
  const { title, rows } = props
  const isEmpty = rows.length === 0

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">{title}</p>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-20 min-w-[12rem] border-b border-r border-border bg-muted/60 px-2 py-2 text-left align-middle font-semibold">
                NAMA
              </th>
              <th className="min-w-16 border-b border-r border-border px-2 py-2 text-center align-middle font-semibold text-status-pagi last:border-r-0">
                PAGI
              </th>
              <th className="min-w-16 border-b border-r border-border px-2 py-2 text-center align-middle font-semibold text-status-siang last:border-r-0">
                SIANG
              </th>
              <th className="min-w-16 border-b border-r border-border px-2 py-2 text-center align-middle font-semibold text-status-libur last:border-r-0">
                LIBUR
              </th>
              <th className="min-w-16 border-b border-r border-border px-2 py-2 text-center align-middle font-semibold text-status-cuti last:border-r-0">
                CUTI
              </th>
              <th className="min-w-24 border-b border-r border-border px-2 py-2 text-center align-middle font-semibold text-status-sakit last:border-r-0">
                SAKIT / IZIN
              </th>
              <th className="min-w-16 border-b border-border px-2 py-2 text-center align-middle font-bold text-primary last:border-r-0">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId}>
                <td className="sticky left-0 z-10 min-w-[12rem] border-b border-r border-border bg-card px-2 py-1.5 align-middle">
                  <p className="truncate text-xs font-semibold text-foreground md:text-sm">{row.name}</p>
                </td>
                <td className="border-b border-r border-border px-2 py-1.5 text-center align-middle">
                  <span className={cn("inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold ring-1 bg-green-500 text-white ring-green-500/30")}>
                    {row.pagi}
                  </span>
                </td>
                <td className="border-b border-r border-border px-2 py-1.5 text-center align-middle">
                  <span className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold ring-1 bg-blue-500 text-white ring-blue-500/30">
                    {row.siang}
                  </span>
                </td>
                <td className="border-b border-r border-border px-2 py-1.5 text-center align-middle">
                  <span className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold ring-1 bg-red-500 text-white ring-red-500/30">
                    {row.libur}
                  </span>
                </td>
                <td className="border-b border-r border-border px-2 py-1.5 text-center align-middle">
                  <span className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold ring-1 bg-red-500 text-white ring-red-500/30">
                    {row.cuti}
                  </span>
                </td>
                <td className="border-b border-r border-border px-2 py-1.5 text-center align-middle">
                  <span className="inline-flex h-6 min-w-12 items-center justify-center rounded px-1.5 text-xs font-bold ring-1 bg-red-500 text-white ring-red-500/30">
                    {row.sakitIzin}
                  </span>
                </td>
                <td className="border-b border-border px-2 py-1.5 text-center align-middle">
                  <span className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-base font-extrabold text-primary">
                    {row.total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEmpty && (
        <p className="mt-3 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
      )}
    </section>
  )
}
