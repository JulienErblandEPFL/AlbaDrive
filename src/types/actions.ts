/**
 * Standardized return type for all Server Actions.
 * Actions NEVER throw — they always return this shape.
 *
 * The error field carries a translation `code` (a dotted path into the i18n
 * messages, e.g. "errors.common.auth_required" or "validation.review.rating.range")
 * plus optional `params` for ICU interpolation. Clients translate at render
 * time via `useTranslations()` so messages are locale-correct without the
 * action having to know the active locale.
 */
export type ActionError = {
  code: string;
  params?: Record<string, string | number>;
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: ActionError };
