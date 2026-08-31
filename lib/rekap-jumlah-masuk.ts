// ============================================================
// REKAP JUMLAH MASUK BULANAN
//
// Satu sumber perhitungan untuk tabel web (JADWAL SHIFT dan
// BUAT JADWAL SHIFT) maupun PDF. Hanya PRESENTASI/perhitungan
// lokal — TIDAK ada write ke Firestore.
//
// Perhitungan per karyawan untuk bulan yang sedang ditampilkan:
//   PAGI       = jumlah hari berstatus shift_pagi
//   SIANG      = jumlah hari berstatus shift_siang
//   LIBUR      = jumlah hari berstatus libur
//   CUTI       = jumlah hari berstatus cuti
//   SAKIT/IZIN = jumlah hari berstatus sakit ATAU izin (gabungan)
//   TOTAL      = PAGI + SIANG  (hanya jumlah shift masuk)
// ============================================================

export type RekapRow = {
  employeeId: string
  name: string
  pagi: number
  siang: number
  libur: number
  cuti: number
  sakitIzin: number
  total: number
}

export type RekapStatusResolver = (employeeId: string, tanggal: string) => string | null | undefined

export function computeRekapRows(
  employees: { id: string; name: string }[],
  year: number,
  month: number,
  resolver: RekapStatusResolver,
  getDateKeyFn: (year: number, month: number, day: number) => string,
): RekapRow[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  return employees.map((employee) => {
    let pagi = 0
    let siang = 0
    let libur = 0
    let cuti = 0
    let sakitIzin = 0

    for (let day = 1; day <= daysInMonth; day++) {
      const tanggal = getDateKeyFn(year, month, day)
      const status = resolver(employee.id, tanggal)
      if (!status) continue
      switch (status) {
        case "shift_pagi":
          pagi += 1
          break
        case "shift_siang":
          siang += 1
          break
        case "libur":
          libur += 1
          break
        case "cuti":
          cuti += 1
          break
        case "sakit":
        case "izin":
          sakitIzin += 1
          break
        default:
          break
      }
    }

    return {
      employeeId: employee.id,
      name: employee.name,
      pagi,
      siang,
      libur,
      cuti,
      sakitIzin,
      total: pagi + siang,
    }
  })
}
