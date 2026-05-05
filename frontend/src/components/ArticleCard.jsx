import {
  BookmarkPlus,
  ExternalLink,
  FlaskConical,
  Heart,
  ThumbsDown
} from 'lucide-react';

const statusLabels = {
  new: '未要約',
  queued: 'Notion同期待ち',
  summarized: '要約済み',
  failed: '失敗'
};

const sourceLabels = {
  manual: '手動登録'
};

export function ArticleCard({ article, onReacting }) {
  const createdAt = new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(article.created_at));

  return (
    <article className="article-card">
      <div className="article-card__meta">
        <span>{sourceLabels[article.source] || article.source}</span>
        <span>{statusLabels[article.status] || article.status}</span>
      </div>

      <h2>{article.title}</h2>

      <a className="article-card__url" href={article.url} target="_blank" rel="noreferrer">
        {article.url}
      </a>

      {article.summary_short && (
        <p className="article-card__summary">{article.summary_short}</p>
      )}

      <div className="article-card__date">登録: {createdAt}</div>

      {article.notion_queue_types.length > 0 && (
        <div className="article-card__queue">
          保存待ち: {article.notion_queue_types.map(toQueueLabel).join(' / ')}
        </div>
      )}

      <div className="article-card__actions">
        <button type="button" onClick={() => onReacting(article.id, 'interested')}>
          <Heart size={17} />
          興味ある
        </button>
        <button type="button" onClick={() => onReacting(article.id, 'not_interested')}>
          <ThumbsDown size={17} />
          興味なし
        </button>
        <button type="button" onClick={() => onReacting(article.id, 'read_later')}>
          <BookmarkPlus size={17} />
          後で読む
        </button>
        <button type="button" onClick={() => onReacting(article.id, 'try_later')}>
          <FlaskConical size={17} />
          試したい
        </button>
        <a className="article-card__open" href={article.url} target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          元記事
        </a>
      </div>
    </article>
  );
}

function toQueueLabel(type) {
  if (type === 'read_later') return '後で読む';
  if (type === 'try_later') return '試したい';
  return type;
}

