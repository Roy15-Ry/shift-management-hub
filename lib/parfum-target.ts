export function allocatePCS(total: number, employeeCount: number): number[] {
  if (employeeCount <= 0) return [];
  const base = Math.floor(total / employeeCount);
  const remainder = total % employeeCount;
  const result: number[] = [];
  for (let i = 0; i < employeeCount; i++) {
    result.push(i < remainder ? base + 1 : base);
  }
  return result;
}

export function allocateML(totalML: number, employeeCount: number): number[] {
  if (employeeCount <= 0) return [];
  const totalUnits = Math.round(totalML * 100);
  const base = Math.floor(totalUnits / employeeCount);
  const remainder = totalUnits % employeeCount;
  const result: number[] = [];
  for (let i = 0; i < employeeCount; i++) {
    const units = i < remainder ? base + 1 : base;
    result.push(Number((units / 100).toFixed(2)));
  }
  return result;
}

export function validatePCS(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export function validateML(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded !== n) return null;
  return rounded;
}

export function sumAllocations(allocations: number[]): number {
  return allocations.reduce((acc, v) => acc + v, 0);
}

export function formatMl(value: number): string {
  return `${value.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ML`;
}
