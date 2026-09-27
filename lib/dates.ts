/**
 * Prisma 8 declares `timestamptz` as a branded string, but the Postgres
 * `temporal` codec actually hands back a `Temporal.Instant`. `new Date(instant)`
 * throws `TypeError: Cannot use valueOf` because Temporal forbids implicit
 * coercion, so timestamps must be converted explicitly.
 */
type TemporalLike = { epochMilliseconds: number };

export type TimestampLike =
  | Date
  | string
  | number
  | TemporalLike
  | null
  | undefined;

function isTemporal(value: unknown): value is TemporalLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TemporalLike).epochMilliseconds === "number"
  );
}

export function toDate(value: TimestampLike): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (isTemporal(value)) {
    return new Date(value.epochMilliseconds);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: TimestampLike, fallback = "—"): string {
  return toDate(value)?.toLocaleDateString() ?? fallback;
}
