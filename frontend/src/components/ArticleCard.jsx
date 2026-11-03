import {
  BookmarkPlus,
  ExternalLink,
  Heart,
  LoaderCircle,
  Rss,
  Sparkles,
  ThumbsDown
} from 'lucide-react';

const sourceLabels = {
  manual: '手動登録',
  zenn: 'Zenn',
  qiita: 'Qiita',
  github_blog: 'GitHub Blog',
  openai_blog: 'OpenAI Blog',
  itmedia_news: 'ITmedia NEWS',
  itmedia_ai: 'ITmedia AI+',
  codezine: 'CodeZine',
  yahoo_news_it_topics: 'Yahoo!ニュース IT',
  yahoo_news_it: 'Yahoo!ニュース IT',
  forest_watch: '窓の杜',
  gigazine: 'GIGAZINE',
  unity_blog: 'Unity Blog',
  cloudflare_blog: 'Cloudflare Blog'
};

const priorityLabels = {
  5: '高',
  4: 'やや高',
  3: '中',
  2: '低',
  1: '控えめ'
};

export function ArticleCard({
  article,
  pendingReaction,
  reactionError,
  onReacting
}) {
  const isManual = article.source === 'manual';
  const latestReaction = getLatestReaction(article);
  const notionState = getNotionState(article);
  const summaryDate = new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(article.updated_at || article.created_at));

  return (
    <article
      className={[
        'article-card',
        isManual ? 'article-card--manual' : 'article-card--rss',
        latestReaction === 'not_interested' ? 'article-card--muted' : ''
      ].filter(Boolean).join(' ')}
    >
      <div className="article-card__top">
        <div className="article-card__chips">
          <span className={`chip ${isManual ? 'chip--manual' : 'chip--rss'}`}>
            {isManual ? <BookmarkPlus size={14} /> : <Rss size={14} />}
            {sourceLabels[article.source] || article.source}
          </span>
          {article.priority ? (
            <span className="chip chip--priority">
              優先度 {priorityLabels[article.priority] || article.priority}
            </span>
          ) : null}
          {latestReaction === 'interested' ? <span className="chip chip--interested">興味あり</span> : null}
          {latestReaction === 'not_interested' ? <span className="chip chip--not-interested">興味なし</span> : null}
          {latestReaction === 'try_later' ? <span className="chip chip--try-later">@Muse</span> : null}
        </div>

        <a className="article-card__open" href={article.url} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          開く
        </a>
      </div>

      <div className="article-card__heading">
        <h2>{article.title}</h2>
        <p className="article-card__date">要約更新 {summaryDate}</p>
      </div>

      <a className="article-card__url" href={article.url} target="_blank" rel="noreferrer">
        {article.url}
      </a>

      <p className="article-card__summary">{article.summary_short || article.raw_excerpt}</p>

      {Array.isArray(article.tags) && article.tags.length > 0 ? (
        <div className="article-card__tags">
          {article.tags.map((tag) => (
            <span key={`${article.id}-${tag}`}>{tag}</span>
          ))}
        </div>
      ) : null}

      <div className="article-card__details">
        {article.tech_points ? (
          <details className="detail-block">
            <summary>技術ポイント</summary>
            <p>{article.tech_points}</p>
          </details>
        ) : null}

        {article.relevance ? (
          <details className="detail-block">
            <summary>関係ある理由</summary>
            <p>{article.relevance}</p>
          </details>
        ) : null}
      </div>

      {notionState ? (
        <div className={`article-card__notion article-card__notion--${notionState.kind}`}>
          <Sparkles size={15} />
          {notionState.label}
        </div>
      ) : null}

      {reactionError ? (
        <div className="article-card__inline-error">{reactionError}</div>
      ) : null}

      <div className="article-card__actions">
        <ReactionButton
          icon={Heart}
          label="興味ある"
          active={latestReaction === 'interested'}
          pending={pendingReaction === 'interested'}
          tone="interested"
          onClick={() => onReacting(article.id, 'interested')}
        />
        <ReactionButton
          icon={ThumbsDown}
          label="興味なし"
          active={latestReaction === 'not_interested'}
          pending={pendingReaction === 'not_interested'}
          tone="not_interested"
          onClick={() => onReacting(article.id, 'not_interested')}
        />
        <ReactionButton
          icon={Sparkles}
          label="@Muse"
          active={latestReaction === 'try_later'}
          pending={pendingReaction === 'try_later'}
          tone="try_later"
          onClick={() => onReacting(article.id, 'try_later')}
        />
      </div>
    </article>
  );
}

function ReactionButton({ icon: Icon, label, active, pending, tone, onClick }) {
  return (
    <button
      type="button"
      className={[
        'reaction-button',
        active ? `reaction-button--${tone}-active` : '',
        pending ? 'reaction-button--pending' : ''
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={pending}
    >
      {pending ? <LoaderCircle size={17} className="spin" /> : <Icon size={17} />}
      {label}
    </button>
  );
}

function getLatestReaction(article) {
  if (!Array.isArray(article.reactions) || article.reactions.length === 0) {
    return null;
  }

  return article.reactions[article.reactions.length - 1] || null;
}

function getNotionState(article) {
  const statuses = Array.isArray(article.notion_queue_statuses) ? article.notion_queue_statuses : [];

  if (statuses.includes('failed')) {
    return { kind: 'failed', label: 'Muse保存に失敗しました。再同期できます。' };
  }

  if (statuses.includes('queued')) {
    return { kind: 'queued', label: 'Museに保存中です。' };
  }

  if (statuses.includes('synced')) {
    return { kind: 'synced', label: 'Muse保存済みです。' };
  }

  if (getLatestReaction(article) === 'try_later') {
    return { kind: 'muse', label: 'Museに保存予定です。' };
  }

  return null;
}
