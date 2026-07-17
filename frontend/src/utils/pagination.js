export const PAGE_SIZE = 15;

export const parsePagedResponse = (data) => {
  if (Array.isArray(data)) {
    return {
      items: data,
      hasMore: false,
      nextBefore: null
    };
  }

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    hasMore: Boolean(data?.hasMore),
    nextBefore: data?.nextBefore || null
  };
};

export const buildPagedUrl = (baseUrl, { limit = PAGE_SIZE, before = null, extraParams = {} } = {}) => {
  const url = new URL(baseUrl);
  url.searchParams.set('limit', String(limit));

  if (before) {
    url.searchParams.set('before', before);
  }

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};