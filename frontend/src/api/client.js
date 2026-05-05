const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'API request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function fetchArticles({
  status = 'summarized',
  sort = 'updated_desc',
  limit = 60,
  includeArchived = false
} = {}) {
  const params = new URLSearchParams();

  if (status) params.set('status', status);
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  if (includeArchived) params.set('include_archived', 'true');

  const query = params.toString();
  return request(`/api/articles${query ? `?${query}` : ''}`);
}

export function createSummarizeLinkJob(payload) {
  return request('/api/jobs/summarize-link', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function sendReaction(articleId, reaction) {
  return request(`/api/articles/${articleId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ reaction })
  });
}

export function createFetchAndSummarizeJob() {
  return request('/api/jobs/fetch-and-summarize', {
    method: 'POST'
  });
}

export function fetchLatestFetchAndSummarizeJob() {
  return request('/api/jobs/fetch-and-summarize/latest');
}

export function fetchLatestSummarizeLinkJob() {
  return request('/api/jobs/summarize-link/latest');
}
