export interface PageOpts { page: number; pageSize: number }
export function parsePage(q: Record<string, unknown>): PageOpts {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? '20'), 10) || 20));
  return { page, pageSize };
}
export function pageMeta(total: number, { page, pageSize }: PageOpts) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
