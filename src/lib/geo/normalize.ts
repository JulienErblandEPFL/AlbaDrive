// Strips diacritics, lowercases, and trims — so "munchen" matches "München"
// and "shkoder" matches "Shkodër".
export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
