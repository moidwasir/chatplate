/** All money in the API is in paisa (1 PKR = 100 paisa) */
export function formatPKR(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export function rupeesToPaisa(rupees: string | number): number {
  return Math.round(Number(rupees) * 100);
}

export function paisaToRupees(paisa: number): string {
  return String(paisa / 100);
}

/** "22:00" → "10:00 pm" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}
