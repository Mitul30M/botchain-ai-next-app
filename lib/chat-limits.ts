/**
 * Shared chat contract limits.
 *
 * These live outside `actions.ts` on purpose: every export from a
 * `"use server"` file becomes a Server Function endpoint, and Next.js rejects
 * anything that is not an async function there. A plain module is the only way
 * to share one value between the actions that enforce it and the dialog that
 * advertises it.
 */

/** Mirrors the backend's `ChatUpdate.title` max length. */
export const CHAT_TITLE_MAX_LENGTH = 120;
