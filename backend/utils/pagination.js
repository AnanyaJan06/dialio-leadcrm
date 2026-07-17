export const DEFAULT_PAGE_SIZE = 15;
export const MAX_PAGE_SIZE = 100;

export const parseLimit = (value, fallback = DEFAULT_PAGE_SIZE) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
};

export const parseBeforeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const buildPaginatedResponse = (items, limit, getCursor) => {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextBefore = hasMore && pageItems.length > 0
    ? getCursor(pageItems[pageItems.length - 1])
    : null;

  return {
    items: pageItems,
    hasMore,
    nextBefore
  };
};