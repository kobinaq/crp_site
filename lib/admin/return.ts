// The list address a detail page can return to. Same keys as the records page.
export type ListReturn = {
  readonly list: string;
  readonly q: string;
  readonly status: string;
  readonly track: string;
  readonly language: string;
  readonly cycle: string;
  readonly age: string;
  readonly queue: string;
  readonly attention: string;
  readonly page: number;
};

export function recordsHref(query: ListReturn): string {
  const params = new URLSearchParams();
  params.set("list", query.list);
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.track) params.set("track", query.track);
  if (query.language) params.set("language", query.language);
  if (query.cycle) params.set("cycle", query.cycle);
  if (query.age) params.set("age", query.age);
  if (query.queue) params.set("queue", query.queue);
  if (query.attention) params.set("attention", query.attention);
  if (query.page > 1) params.set("page", String(query.page));
  return `/admin/records?${params.toString()}`;
}

export function detailHref(pathname: string, query: ListReturn): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.track) params.set("track", query.track);
  if (query.language) params.set("language", query.language);
  if (query.cycle) params.set("cycle", query.cycle);
  if (query.age) params.set("age", query.age);
  if (query.queue) params.set("queue", query.queue);
  if (query.attention) params.set("attention", query.attention);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function filtersAreOpen(query: ListReturn): boolean {
  return Boolean(query.q || query.status || query.track || query.language || query.cycle || query.age || query.queue || query.attention);
}
