// src/lib/reviews/display-name.ts

/**
 * Converts a full name like "Jean Dupont" to the pseudonymised display
 * form "Jean D." used throughout the reviews feature so a raw last name
 * never crosses the Client boundary.
 *
 * Edge cases:
 * - Single token (e.g. "Jean") → returned unchanged.
 * - Empty / whitespace-only → "?".
 * - Hyphenated first names preserved intact.
 * - Last initial is always uppercased; first token keeps its casing.
 */
export function pseudonymizeName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last[0]?.toUpperCase() ?? "";
  return `${first} ${initial}.`;
}
