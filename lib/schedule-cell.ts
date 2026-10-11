export type ScheduleCellIdentity = {
  employeeId: string
  tanggal: string
}

export function updateScheduleCellAfterDelete<T extends ScheduleCellIdentity>(
  schedules: T[],
  employeeId: string,
  tanggal: string,
  deleteSucceeded: boolean,
): T[] {
  if (!deleteSucceeded) return schedules

  return schedules.filter(
    (schedule) =>
      schedule.employeeId !== employeeId || schedule.tanggal !== tanggal,
  )
}
