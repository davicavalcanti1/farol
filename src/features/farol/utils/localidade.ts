// Mapeamento sala → localidade derivado de heurística sobre o nome da sala.
// O NetRis não devolve campo de localidade explícito; o nome da sala é o
// único identificador. Os patterns abaixo cobrem os 4 endereços operacionais
// da Imago em 25/mai/2026 — se aparecer uma sala nova, o default "Principal"
// segura sem quebrar a UI.

export const LOCALIDADES = ["Principal", "Anexo", "San Pietro", "Queimadas"] as const;
export type Localidade = typeof LOCALIDADES[number];

export function salaToLocalidade(sala: string | null | undefined): Localidade {
  if (!sala) return "Principal";
  const s = sala.toUpperCase();
  if (s.includes("SAN PIETRO")) return "San Pietro";
  if (s.includes("QUEIMADAS"))  return "Queimadas";
  if (s.includes("ANEXO"))      return "Anexo";
  return "Principal";
}
