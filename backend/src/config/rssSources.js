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
    id: 'itmedia_news',
    name: 'ITmedia NEWS',
    url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
    enabled: true,
    note: 'ITmedia NEWS latest articles feed'
  },
  {
    id: 'itmedia_ai',
    name: 'ITmedia AI+',
    url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',
    enabled: true,
    note: 'ITmedia AI+ latest articles feed'
  },
  {
    id: 'codezine',
    name: 'CodeZine',
    url: 'https://codezine.jp/rss/new/20/index.xml',
    enabled: true,
    note: 'CodeZine latest articles RSS feed'
  },
  {
    id: 'yahoo_news_it_topics',
    name: 'Yahoo!ニュース ITトピックス',
    url: 'https://news.yahoo.co.jp/rss/topics/it.xml',
    enabled: false,
    note: 'Candidate feed. Yahoo!ニュース RSS has usage restrictions, so keep disabled until explicitly opted in.'
  },
  {
    id: 'yahoo_news_it',
    name: 'Yahoo!ニュース IT',
    url: 'https://news.yahoo.co.jp/rss/categories/it.xml',
    enabled: false,
    note: 'Candidate feed. Yahoo!ニュース RSS has usage restrictions, so keep disabled until explicitly opted in.'
  },
  {
    id: 'forest_watch',
    name: '窓の杜',
    url: 'https://forest.watch.impress.co.jp/data/rss/1.0/wf/feed.rdf',
    enabled: false,
    note: 'Candidate feed for software and Windows tool news'
  },
  {
    id: 'gigazine',
    name: 'GIGAZINE',
    url: 'https://gigazine.net/news/rss_2.0/',
    enabled: false,
    note: 'Candidate broad tech/news feed; kept disabled to avoid noisy articles'
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
