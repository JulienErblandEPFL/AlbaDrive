/**
 * Standardized return type for all Server Actions.
 * Actions NEVER throw — they always return this shape.
 */
export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
