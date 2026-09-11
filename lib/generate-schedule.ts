// ============================================================
// GENERATE SCHEDULE — PURE BULANAN (TAHAP 1)
//
// Pure function untuk fitur "Buat Jadwal Otomatis".
//
// MODUL INI HANYA BERISI LOGIKA MURNI:
// - tidak mengakses Firebase / Firestore
// - tidak mengakses localStorage / browser API
// - tidak melakukan network request / write
// - tidak memutasi input
//
// Generator menghasilkan assignment PAGI/SIANG baru HANYA untuk
// slot yang KOSONG. Sel yang sudah memiliki keputusan (PAGI,
// SIANG, LIBUR, CUTI, IZIN, SAKIT, STATUS KHUSUS, dst) dianggap
// LOCKED dan TIDAK PERNAH ditimpa.
//
// Deterministik: input yang sama -> output yang sama.
//
// Konvensi tanggal: string ISO "YYYY-MM-DD". month 0-based
// (0 = Januari ... 11 = Desember), konsisten dengan app.
// ============================================================

// ============================================================
// TYPES
// ============================================================

export type GenerateScheduleStatus =
  | "shift_pagi"
  | "shift_siang"
  | "libur"
  | "cuti"
  | "izin"
  | "sakit"
  | "status_khusus"

export type GenerateShiftStatus =
  | "shift_pagi"
  | "shift_siang"

export interface GenerateScheduleEmployee {
  id: string
  posisi?: string | null
}

export interface GenerateScheduleCell {
  employeeId: string
  tanggal: string
  status: GenerateScheduleStatus
  statusKhusus?: string
}

export type PreviousMonthLastDay = Readonly<
  Record<string, GenerateScheduleStatus>
>

export interface GenerateScheduleInput {
  year: number
  month: number
  employees: readonly GenerateScheduleEmployee[]
  existing: readonly GenerateScheduleCell[]
  previousMonthLastDay?: PreviousMonthLastDay
}

export interface GeneratedAssignment {
  employeeId: string
  tanggal: string
  status: GenerateShiftStatus
}

export interface GenerateScheduleMetadata {
  daysProcessed: number
  totalAssignments: number
  kepalaId: string | null
  wakilId: string | null
  bossRuleEnforcedCount: number
  bossRuleImpossibleCount: number
  targetDeviationCount: number
  duplicateEmployeeCount: number
  unknownEmployeeCells: number
}

export interface GenerateScheduleResult {
  assignments: GeneratedAssignment[]
  warnings: string[]
  metadata: GenerateScheduleMetadata
}

// ============================================================
// KONSTANTA SKOR / BOBOT
//
// Skor yang lebih tinggi = kandidat LEBIH cocok menerima PAGI.
// (Kandidat ber-skoor rendah akan mendapatkan SIANG.)
//
// Bobot dipilih agar hierarki prioritas tercermin:
//   return LIBUR/CUTI  -> sangat kuat memilih SIANG
//   arah bulan lalu    -> sedang, hanya untuk tanggal 1
//   rotasi 2-2         -> sedang
//   fairness P/S bulan -> ringan
// ============================================================

const RETURN_LIBUR_CUTI_PENALTY = 5
const PREV_MONTH_DIRECTION_WEIGHT = 2
const ROTATION_CONTINUE = 1
const ROTATION_SWITCH = 2
const FAIRNESS_WEIGHT = 1
const FAIRNESS_CLAMP = 2

// Posisi yang dikenali secara aman (normalisasi: lowercase,
// trim, dan lipat whitespace berlebih).
const POSISI_HEAD = "kepala toko"
const POSISI_WAKIL = "wakil kepala toko"

// ============================================================
// HELPERS TANGGAL (murni, tanpa Date/Intl)
// ============================================================

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
      return isLeapYear(year) ? 29 : 28
    case 3:
    case 5:
    case 8:
    case 10:
      return 30
    default:
      return 31
  }
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// ============================================================
// VALIDASI & NORMALISASI
// ============================================================

function isShiftStatus(status: string): boolean {
  return status === "shift_pagi" || status === "shift_siang"
}

// Normalisasi aman untuk posisi free-text. Hanya lipat whitespace
// dan lower-case. TIDAK menebak singkatan (KT / WKT / dst).
function normalizePosisi(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase()
}

function detectBosses(
  employees: GenerateScheduleEmployee[],
): { kepalaId: string | null; wakilId: string | null; warnings: string[] } {
  const normalized: Record<string, string[]> = {
    [POSISI_HEAD]: [],
    [POSISI_WAKIL]: [],
  }

  for (const employee of employees) {
    const posisi = employee.posisi?.trim()
    if (!posisi) continue
    const key = normalizePosisi(posisi)
    const list = normalized[key]
    if (list) list.push(employee.id)
  }

  const warnings: string[] = []
  const kepalaId = normalized[POSISI_HEAD][0] ?? null
  const wakilId = normalized[POSISI_WAKIL][0] ?? null

  if (normalized[POSISI_HEAD].length > 1) {
    warnings.push(
      `Ditemukan lebih dari satu "Kepala Toko"; hanya "${kepalaId}" yang dianggap Kepala Toko.`,
    )
  }
  if (normalized[POSISI_WAKIL].length > 1) {
    warnings.push(
      `Ditemukan lebih dari satu "Wakil Kepala Toko"; hanya "${wakilId}" yang dianggap Wakil Kepala Toko.`,
    )
  }

  return { kepalaId, wakilId, warnings }
}

// ============================================================
// SKOR KANDIDAT PAGI
// ============================================================

type DayStatusRow = (GenerateScheduleStatus | null)[]

function findLastShiftRun(
  row: DayStatusRow,
  start: number,
): { status: GenerateShiftStatus; run: number } | null {
  let status: GenerateShiftStatus | null = null
  let run = 0

  for (let i = start; i >= 0; i--) {
    const value = row[i]
    if (value === "shift_pagi" || value === "shift_siang") {
      if (status === null) {
        status = value
        run = 1
      } else if (value === status) {
        run += 1
      } else {
        break
      }
    } else {
      break
    }
  }

  return status ? { status, run } : null
}

interface PagiScoreContext {
  empId: string
  row: DayStatusRow
  dayIndex: number
  pagiCount: number
  siangCount: number
  prevMonthLastDay?: PreviousMonthLastDay
}

function computePagiScore(ctx: PagiScoreContext): number {
  const { empId, row, dayIndex, pagiCount, siangCount, prevMonthLastDay } = ctx
  let score = 0

  // Rotasi 2-2: lanjutkan pasangan yang belum genap, pindah setelah
  // sepasang. Hari non-shift memutus siklus.
  const lastRun = findLastShiftRun(row, dayIndex - 1)
  if (lastRun) {
    if (lastRun.status === "shift_pagi") {
      score += lastRun.run >= 2 ? -ROTATION_SWITCH : ROTATION_CONTINUE
    } else {
      score += lastRun.run >= 2 ? ROTATION_SWITCH : -ROTATION_CONTINUE
    }
  } else if (dayIndex === 0 && prevMonthLastDay) {
    // Arah hari terakhir bulan sebelumnya: HANYA untuk tanggal 1.
    const prev = prevMonthLastDay[empId]
    if (prev === "shift_pagi") score -= PREV_MONTH_DIRECTION_WEIGHT
    else if (prev === "shift_siang") score += PREV_MONTH_DIRECTION_WEIGHT
  }

  // Kembali dari LIBUR/CUTI -> prefer SIANG.
  if (dayIndex > 0) {
    const yesterday = row[dayIndex - 1]
    if (yesterday === "libur" || yesterday === "cuti") {
      score -= RETURN_LIBUR_CUTI_PENALTY
    }
  }

  // Fairness PAGI/SIANG bulan berjalan.
  const diff = pagiCount - siangCount
  const clamped = Math.max(-FAIRNESS_CLAMP, Math.min(FAIRNESS_CLAMP, diff))
  score -= clamped * FAIRNESS_WEIGHT

  return score
}

// ============================================================
// STRUKTUR INTERNAL SATU HARI
// ============================================================

interface DayDecision {
  empId: string
  status: GenerateShiftStatus
}

// ============================================================
// GENERATOR UTAMA
// ============================================================

export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const warnings: string[] = []

  const metadata: GenerateScheduleMetadata = {
    daysProcessed: 0,
    totalAssignments: 0,
    kepalaId: null,
    wakilId: null,
    bossRuleEnforcedCount: 0,
    bossRuleImpossibleCount: 0,
    targetDeviationCount: 0,
    duplicateEmployeeCount: 0,
    unknownEmployeeCells: 0,
  }

  // ---- Validasi dasar --------------------------------------

  if (!Number.isInteger(input.year) || !Number.isInteger(input.month)) {
    warnings.push("year/month tidak valid; generator dibatalkan.")
    return { assignments: [], warnings, metadata }
  }

  if (input.month < 0 || input.month > 11) {
    warnings.push(`Bulan tidak valid (${input.month}); generator dibatalkan.`)
    return { assignments: [], warnings, metadata }
  }

  // ---- Dedupe employee (deterministik: entri pertama menang) ---

  const seenEmployeeIds = new Set<string>()
  const employees: GenerateScheduleEmployee[] = []
  for (const employee of input.employees) {
    const id = employee?.id
    if (!id) continue
    if (seenEmployeeIds.has(id)) {
      metadata.duplicateEmployeeCount += 1
      continue
    }
    seenEmployeeIds.add(id)
    employees.push({ id, posisi: employee.posisi })
  }

  if (metadata.duplicateEmployeeCount > 0) {
    warnings.push(
      `Ditemukan ${metadata.duplicateEmployeeCount} entri employee duplikat; entri pertama yang dipakai.`,
    )
  }

  if (employees.length === 0) {
    warnings.push("Tidak ada employee aktif yang dapat diproses.")
    return { assignments: [], warnings, metadata }
  }

  const empIndex = new Map<string, number>()
  employees.forEach((employee, index) => {
    empIndex.set(employee.id, index)
  })

  // ---- Posisi Kepala / Wakil -------------------------------

  const bossInfo = detectBosses(employees)
  metadata.kepalaId = bossInfo.kepalaId
  metadata.wakilId = bossInfo.wakilId
  warnings.push(...bossInfo.warnings)

  // ---- Susun tanggal bulan berjalan -------------------------

  const dayCount = daysInMonth(input.year, input.month)
  const dates: string[] = []
  for (let day = 1; day <= dayCount; day++) {
    dates.push(dateKey(input.year, input.month, day))
  }

  // ---- Susun peta existing per tanggal/employee -------------
  // Sel duplikat (employee+tanggal sama) -> entri pertama menang.

  const existingByDate = new Map<string, Map<string, GenerateScheduleCell>>()
  const seenCells = new Set<string>()

  for (const cell of input.existing) {
    if (!cell || !cell.employeeId || !empIndex.has(cell.employeeId)) {
      metadata.unknownEmployeeCells += 1
      continue
    }
    const key = `${cell.employeeId}:${cell.tanggal}`
    if (seenCells.has(key)) continue
    seenCells.add(key)
    if (!existingByDate.has(cell.tanggal)) {
      existingByDate.set(cell.tanggal, new Map())
    }
    existingByDate.get(cell.tanggal)!.set(cell.employeeId, cell)
  }

  if (metadata.unknownEmployeeCells > 0) {
    warnings.push(
      `${metadata.unknownEmployeeCells} sel existing mengacu employee yang tidak dikenal; abaikan.`,
    )
  }

  // ---- Status harian per employee (existing + hasil) --------
  // row[dayIndex] = status hari itu, null bila kosong.

  const dayStatus = new Map<string, DayStatusRow>()
  for (const employee of employees) {
    dayStatus.set(employee.id, new Array<GenerateScheduleStatus | null>(dayCount).fill(null))
  }
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const cells = existingByDate.get(dates[dayIndex])
    if (!cells) continue
    cells.forEach((cell, employeeId) => {
      const row = dayStatus.get(employeeId)
      if (row) row[dayIndex] = cell.status
    })
  }

  // ---- Counter fairness bulan berjalan -----------------------

  const pagiCountByEmp = new Map<string, number>()
  const siangCountByEmp = new Map<string, number>()

  for (const employee of employees) {
    pagiCountByEmp.set(employee.id, 0)
    siangCountByEmp.set(employee.id, 0)
  }

  for (const cell of input.existing) {
    if (!cell || !empIndex.has(cell.employeeId)) continue
    const row = dayStatus.get(cell.employeeId)
    if (!row) continue
    const idx = dates.indexOf(cell.tanggal)
    if (idx === -1) continue
    const status = row[idx]
    if (status === "shift_pagi") {
      pagiCountByEmp.set(cell.employeeId, (pagiCountByEmp.get(cell.employeeId) ?? 0) + 1)
    } else if (status === "shift_siang") {
      siangCountByEmp.set(cell.employeeId, (siangCountByEmp.get(cell.employeeId) ?? 0) + 1)
    }
  }

  // ---- Proses hari demi hari (kronologis) ---------------------

  const assignments: GeneratedAssignment[] = []
  const prevMonthLastDay = input.previousMonthLastDay

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const tanggal = dates[dayIndex]
    const cells = existingByDate.get(tanggal)
    const lockedByEmp = cells ?? new Map<string, GenerateScheduleCell>()

    let pagiLocked = 0
    let siangLocked = 0

    for (const employee of employees) {
      const cell = lockedByEmp.get(employee.id)
      if (!cell) continue
      if (cell.status === "shift_pagi") pagiLocked += 1
      else if (cell.status === "shift_siang") siangLocked += 1
    }

    // Employee yang slotnya KOSONG hari ini -> kandidat.
    const empties: GenerateScheduleEmployee[] = employees.filter(
      (employee) => !lockedByEmp.has(employee.id),
    )

    const m = empties.length
    const n = pagiLocked + siangLocked + m

    // Target harian untuk n >= 2: PAGI = floor(n/2), SIANG = ceil(n/2).
    // Total yang diassign generator + locked selalu = n per hari, jadi
    // target SIANG terpenuhi otomatis oleh sisa kandidat.
    // (Kasus n = 1 ditangani khusus di bawah: pilihan ikut preferensi.)
    const targetPagi = Math.floor(n / 2)

    // Sisa yang perlu diisi generator (jangan melebihi jumlah kosong).
    const needPagi = Math.max(0, targetPagi - pagiLocked)
    let pagiTarget = Math.min(m, needPagi)

    // Skor kandidat untuk pemilihan PAGI.
    const scoreByEmp = new Map<string, number>()
    for (const employee of empties) {
      scoreByEmp.set(
        employee.id,
        computePagiScore({
          empId: employee.id,
          row: dayStatus.get(employee.id)!,
          dayIndex,
          pagiCount: pagiCountByEmp.get(employee.id) ?? 0,
          siangCount: siangCountByEmp.get(employee.id) ?? 0,
          prevMonthLastDay,
        }),
      )
    }

    // n = 1: hanya satu orang masuk hari ini -> hanya satu shift yang
    // dibuat. Pilihan PAGI/SIANG mengikuti preferensi generator (rotasi,
    // fairness, return dari LIBUR/CUTI, arah bulan sebelumnya, bila ada),
    // BUKAN dipaksa SIANG. Untuk n >= 2 tetap dipakai formula floor/ceil.
    if (n === 1 && m === 1) {
      const singleScore = scoreByEmp.get(empties[0].id) ?? 0
      pagiTarget = singleScore >= 0 ? 1 : 0
    }

    // ---- Hard rule Kepala/Wakil -------------------------------
    // Jika keduanya masuk hari ini, force berbeda shift.
    // Keputusan user (sel locked) TIDAK pernah diubah; jika user
    // sendiri yang mengunci keduanya di shift sama, tidak difix.

    const forcedPagi = new Set<string>()
    const forcedSiang = new Set<string>()

    // "Masuk" = bekerja hari ini: slot kosong (akan diassign PAGI/SIANG)
    // atau sudah terkunci shift. Boss yang terkunci non-shift (LIBUR,
    // CUTI, IZIN, SAKIT, STATUS KHUSUS) TIDAK dianggap masuk.

    const bossPresent = (id: string | null): boolean => {
      if (id === null) return false
      const cell = lockedByEmp.get(id)
      if (!cell) return empties.some((e) => e.id === id)
      return isShiftStatus(cell.status)
    }
    const kepalaPresent = bossPresent(metadata.kepalaId)
    const wakilPresent = bossPresent(metadata.wakilId)

    if (kepalaPresent && wakilPresent) {
      const kepalaId = metadata.kepalaId!
      const wakilId = metadata.wakilId!
      const kepalaLocked = lockedByEmp.get(kepalaId)?.status
      const wakilLocked = lockedByEmp.get(wakilId)?.status

      const kepalaLockedShift = kepalaLocked && isShiftStatus(kepalaLocked) ? kepalaLocked : null
      const wakilLockedShift = wakilLocked && isShiftStatus(wakilLocked) ? wakilLocked : null

      if (kepalaLockedShift && wakilLockedShift) {
        if (kepalaLockedShift === wakilLockedShift) {
          // Keputusan user berbenturan dengan hard constraint; tidak
          // boleh menimpa keputusan user.
          metadata.bossRuleImpossibleCount += 1
          warnings.push(
            `Kepala Toko & Wakil Kepala Toko sama-sama terkunci shift yang sama pada ${tanggal}; hard constraint tidak dapat dipenuhi dan keputusan user tidak diubah.`,
          )
        } else {
          metadata.bossRuleEnforcedCount += 1
        }
      } else if (kepalaLockedShift) {
        if (kepalaLockedShift === "shift_pagi") {
          forcedSiang.add(wakilId)
        } else {
          forcedPagi.add(wakilId)
        }
        metadata.bossRuleEnforcedCount += 1
      } else if (wakilLockedShift) {
        if (wakilLockedShift === "shift_pagi") {
          forcedSiang.add(kepalaId)
        } else {
          forcedPagi.add(kepalaId)
        }
        metadata.bossRuleEnforcedCount += 1
      } else {
        // Keduanya kosong: boss prefer-PAGI -> PAGI, satunya SIANG.
        const kepalaScore = scoreByEmp.get(kepalaId) ?? 0
        const wakilScore = scoreByEmp.get(wakilId) ?? 0
        const kepalaPrefersPagi =
          kepalaScore > wakilScore ||
          (kepalaScore === wakilScore && (empIndex.get(kepalaId) ?? 0) <= (empIndex.get(wakilId) ?? 0))
        if (kepalaPrefersPagi) {
          forcedPagi.add(kepalaId)
          forcedSiang.add(wakilId)
        } else {
          forcedPagi.add(wakilId)
          forcedSiang.add(kepalaId)
        }
        metadata.bossRuleEnforcedCount += 1
      }
    }

    // ---- Sesuaikan pagiTarget agar force bisa ditempatkan ----

    const requiredSiang = forcedSiang.size
    let requireP = Math.max(pagiTarget, forcedPagi.size)
    if (requireP + requiredSiang > m) {
      requireP = Math.max(0, m - requiredSiang)
    }
    requireP = Math.min(requireP, m)

    if (requireP !== pagiTarget) {
      metadata.targetDeviationCount += 1
    }
    pagiTarget = requireP

    // ---- Seleksi kandidat PAGI (scoring + force) --------------

    const forcedPagiList = [...forcedPagi]
    const excluded = new Set([...forcedPagi, ...forcedSiang])
    const pool = empties
      .filter((employee) => !excluded.has(employee.id))
      .sort((a, b) => {
        const diff = (scoreByEmp.get(b.id) ?? 0) - (scoreByEmp.get(a.id) ?? 0)
        if (diff !== 0) return diff
        return (empIndex.get(a.id) ?? 0) - (empIndex.get(b.id) ?? 0)
      })

    const fillCount = Math.max(0, pagiTarget - forcedPagiList.length)
    const chosenPagi = new Set([...forcedPagiList, ...pool.slice(0, fillCount).map((e) => e.id)])

    // ---- Assign hari ini ---------------------------------------

    const todayDecisions: DayDecision[] = []
    for (const employee of employees) {
      if (lockedByEmp.has(employee.id)) continue
      const status: GenerateShiftStatus = chosenPagi.has(employee.id)
        ? "shift_pagi"
        : "shift_siang"
      todayDecisions.push({ empId: employee.id, status })
    }

    for (const decision of todayDecisions) {
      assignments.push({
        employeeId: decision.empId,
        tanggal,
        status: decision.status,
      })
      const row = dayStatus.get(decision.empId)
      if (row) row[dayIndex] = decision.status
      if (decision.status === "shift_pagi") {
        pagiCountByEmp.set(decision.empId, (pagiCountByEmp.get(decision.empId) ?? 0) + 1)
      } else {
        siangCountByEmp.set(decision.empId, (siangCountByEmp.get(decision.empId) ?? 0) + 1)
      }
    }

    metadata.totalAssignments += todayDecisions.length
    metadata.daysProcessed += 1
  }

  // ---- Semua employee dikunci non-shift -> tidak ada yang diproses --

  if (metadata.daysProcessed === 0) {
    warnings.push("Tidak ada hari yang diproses (semua slot sudah terkunci).")
  }

  return { assignments, warnings, metadata }
}