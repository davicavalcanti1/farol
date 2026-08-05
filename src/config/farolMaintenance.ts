// Janela de manutenção do módulo Farol.
// Para encerrar antes do horário, basta deixar `enabled: false`.
// Para estender, ajuste `endsAt` (ISO com timezone).
export const FAROL_MAINTENANCE = {
  enabled: false,
  startedAt: new Date("2026-05-25T14:13:00-03:00"),
  endsAt:    new Date("2026-05-25T18:13:00-03:00"),
  title:   "Módulo temporariamente indisponível",
  message: "Estamos em manutenção. Em breve o Farol volta ao ar.",
};

export function isFarolUnderMaintenance(now: Date = new Date()): boolean {
  if (!FAROL_MAINTENANCE.enabled) return false;
  return now < FAROL_MAINTENANCE.endsAt;
}
