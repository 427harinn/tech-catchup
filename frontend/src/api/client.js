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

export function fetchArticles(filter) {
  const params = new URLSearchParams();

  if (filter === 'new') params.set('status', 'new');
  if (filter === 'summarized') params.set('status', 'summarized');
  if (filter === 'saved') params.set('saved', 'true');

  const query = params.toString();
  return request(`/api/articles${query ? `?${query}` : ''}`);
}

export function createArticle(payload) {
  return request('/api/articles', {
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

export function fetchRss() {
  return request('/api/rss/fetch', {
    method: 'POST'
  });
}
