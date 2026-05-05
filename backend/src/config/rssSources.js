export const rssSources = [
  {
    id: 'zenn',
    name: 'Zenn',
    url: 'https://zenn.dev/feed',
    enabled: true,
    note: 'Zenn official feed'
  },
  {
    id: 'qiita',
    name: 'Qiita',
    url: 'https://qiita.com/popular-items/feed',
    enabled: true,
    note: 'Qiita popular items Atom feed'
  },
  {
    id: 'github_blog',
    name: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    enabled: true,
    note: 'GitHub official blog feed'
  },
  {
    id: 'openai_blog',
    name: 'OpenAI Blog',
    url: 'https://openai.com/news/rss.xml',
    enabled: true,
    note: 'OpenAI official news feed'
  },
  {
    id: 'unity_blog',
    name: 'Unity Blog',
    url: 'https://unity.com/blog/feed',
    enabled: false,
    note: 'Candidate source kept disabled until a stable official blog feed is confirmed'
  },
  {
    id: 'cloudflare_blog',
    name: 'Cloudflare Blog',
    url: 'https://blog.cloudflare.com/rss/',
    enabled: true,
    note: 'Cloudflare official blog feed'
  }
];

export function listRssSources() {
  return rssSources.map((source) => ({ ...source }));
}

export function getEnabledRssSources() {
  return rssSources.filter((source) => source.enabled);
}
