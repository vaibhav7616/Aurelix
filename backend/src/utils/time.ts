/** Start of the current UTC day — daily limits and "today" stats reset at 00:00 UTC on every server. */
export function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
