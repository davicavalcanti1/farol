/** Data de hoje (ou da Date passada) no formato YYYY-MM-DD em BRT. */
export function hojeBRT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}
