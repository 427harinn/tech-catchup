import { getDb } from '../db/database.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;
const DEFAULT_CANDIDATE_MULTIPLIER = 8;

const REACTION_WEIGHTS = {
  interested: 1.4,
  not_interested: -1.3,
  try_later: 1.9
};

const SOURCE_SCORES = {
  openai_blog: 18,
  github_blog: 16,
  cloudflare_blog: 15,
  qiita: 11,
  zenn: 10,
  manual: 7,
  unity_blog: 9
};

const POPULARITY_SCORES = {
  openai_blog: 22,
  github_blog: 20,
  cloudflare_blog: 18,
  qiita: 16,
  zenn: 10,
  manual: 5,
  unity_blog: 8
};

const GAME_DEV_KEYWORD_PATTERNS = [
  'unity',
  'unity開発',
  'c#',
  'gameobject',
  'animator',
  'addressables',
  'webgl',
  'urp',
  'shader',
  'shaders',
  '2d game',
  '3d game',
  'unreal engine',
  'unreal',
  'ue5',
  'blueprint',
  'niagara',
  'blender',
  'vrm',
  'live2d',
  'rigging',
  'animation',
  'game ai',
  'npc',
  'behavior tree',
  'behaviour tree',
  'pathfinding',
  'mobile game',
  'gyroscope',
  'controller',
  'webrtc',
  'character ai',
  'avatar',
  'local llm',
  'ollama',
  'ゲーム開発',
  'ゲーム制作',
  '2dゲーム',
  '3dゲーム',
  'キャラクター制御',
  'アニメーション',
  'シェーダー',
  '入力処理',
  'スマホゲーム',
  'アバター',
  'ローカルai'
];

const TAG_PATTERNS = [
  { tag: 'AI', patterns: ['ai', 'gpt', 'llm', 'openai', 'claude', 'agent', 'agents', 'copilot', '生成ai', '生成 ai'] },
  { tag: 'GitHub', patterns: ['github', 'copilot', 'actions', 'pull request'] },
  { tag: 'Cloudflare', patterns: ['cloudflare', 'workers', 'durable object', 'durable objects'] },
  { tag: 'Notion', patterns: ['notion'] },
  { tag: 'React', patterns: ['react', 'frontend', 'usememo', 'usecallback', 'rerender'] },
  { tag: 'Firebase', patterns: ['firebase'] },
  { tag: 'GameDev', patterns: GAME_DEV_KEYWORD_PATTERNS },
  { tag: 'Unity', patterns: ['unity', 'ue5', 'unreal', 'shader', 'vfx', 'blender', '3d'] },
  { tag: 'Security', patterns: ['security', 'vulnerability', 'cve', '認証', '脆弱性', 'セキュリティ', '不正アクセス'] },
  { tag: 'Infra', patterns: ['kubernetes', 'webrtc', 'redis', 'network', 'infra', 'aws', 'cloud'] },
  { tag: 'Web', patterns: ['web', 'browser', 'http', 'css', 'javascript', 'typescript'] },
  { tag: 'Rust', patterns: ['rust', 'wasm'] }
];

export function pickupArticles({ limit = DEFAULT_LIMIT, includeFailed = false } = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const db = getDb();
  const interestWeightMap = loadInterestWeights(db);
  const profile = buildPreferenceProfile(db, interestWeightMap);
  const candidates = loadCandidateArticles(db, {
    limit: Math.max(normalizedLimit * DEFAULT_CANDIDATE_MULTIPLIER, 20),
    includeFailed
  });

  if (candidates.length === 0) {
    return {
      articles: [],
      counts: {
        requested: normalizedLimit,
        selected: 0,
        candidates: 0
      }
    };
  }

  const recentHistory = loadRecentSummarizedHistory(db);
  const scoredCandidates = candidates.map((candidate) => scoreCandidate(candidate, {
    profile,
    interestWeightMap,
    recentHistory
  }));

  const selected = selectPickupArticles(scoredCandidates, normalizedLimit);

  return {
    articles: selected.map((item) => ({
      ...item.article,
      pickup: {
        slot: item.slot,
        reason: item.reason,
        scores: item.scores
      }
    })),
    counts: {
      requested: normalizedLimit,
      selected: selected.length,
      candidates: scoredCandidates.length
    }
  };
}

function loadCandidateArticles(db, { limit, includeFailed }) {
  const statuses = includeFailed ? ['new', 'queued', 'failed'] : ['new', 'queued'];
  const params = { limit };
  const placeholders = statuses.map((_, index) => `@status${index}`).join(', ');

  for (const [index, status] of statuses.entries()) {
    params[`status${index}`] = status;
  }

  return db.prepare(`
    SELECT
      a.id,
      a.title,
      a.url,
      a.source,
      a.published_at,
      a.fetched_at,
      a.raw_excerpt,
      a.status,
      a.created_at,
      a.updated_at
    FROM articles a
    WHERE a.archived_at IS NULL
      AND a.status IN (${placeholders})
    ORDER BY datetime(a.created_at) DESC, a.id DESC
    LIMIT @limit
  `).all(params);
}

function buildPreferenceProfile(db, interestWeightMap) {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.title,
      a.source,
      a.raw_excerpt,
      s.tags,
      s.summary_short,
      s.tech_points,
      (
        SELECT r.reaction
        FROM reactions r
        WHERE r.article_id = a.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      ) AS latest_reaction,
      EXISTS (
        SELECT 1
        FROM notion_queue nq
        WHERE nq.article_id = a.id
          AND nq.type = 'try_later'
          AND nq.status = 'synced'
      ) AS has_synced_try_later
    FROM articles a
    LEFT JOIN summaries s ON s.article_id = a.id
    WHERE EXISTS (
      SELECT 1
      FROM reactions r
      WHERE r.article_id = a.id
    )
  `).all();

  const tagWeights = new Map();
  const keywordWeights = new Map();
  const sourceWeights = new Map();

  for (const row of rows) {
    const reaction = row.latest_reaction;
    if (!reaction || !REACTION_WEIGHTS[reaction]) {
      continue;
    }

    let weight = REACTION_WEIGHTS[reaction];
    if (reaction === 'try_later' && row.has_synced_try_later) {
      weight += 0.8;
    }

    const inferredTags = inferCandidateTags(row);
    const summaryTags = parseJsonArray(row.tags);
    const tags = new Set([...summaryTags, ...inferredTags]);

    for (const tag of tags) {
      const scaledWeight = weight * getInterestWeightMultiplier(interestWeightMap, tag);
      addWeight(tagWeights, tag, scaledWeight);
    }

    for (const keyword of extractKeywords([row.title, row.raw_excerpt, row.summary_short, row.tech_points])) {
      addWeight(keywordWeights, keyword, weight * 0.35);
    }

    addWeight(sourceWeights, row.source, weight * 0.75);
  }

  return {
    tagWeights,
    keywordWeights,
    sourceWeights
  };
}

function loadRecentSummarizedHistory(db) {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.source,
      a.title,
      a.raw_excerpt,
      s.tags
    FROM articles a
    INNER JOIN summaries s ON s.article_id = a.id
    WHERE a.archived_at IS NULL
      AND a.status = 'summarized'
    ORDER BY datetime(a.updated_at) DESC, a.id DESC
    LIMIT 40
  `).all();

  const sourceCounts = new Map();
  const tagCounts = new Map();

  for (const row of rows) {
    addWeight(sourceCounts, row.source, 1);
    for (const tag of new Set([...parseJsonArray(row.tags), ...inferCandidateTags(row)])) {
      addWeight(tagCounts, tag, 1);
    }
  }

  return {
    sampleSize: rows.length,
    sourceCounts,
    tagCounts
  };
}

function loadInterestWeights(db) {
  const rows = db.prepare(`
    SELECT tag, weight
    FROM interest_weights
  `).all();

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.tag), Number(row.weight));
  }
  return map;
}

function scoreCandidate(article, context) {
  const inferredTags = inferCandidateTags(article);
  const keywords = extractKeywords([article.title, article.raw_excerpt]);

  const interestScore = calculateInterestScore(article, inferredTags, keywords, context.profile);
  const popularityScore = calculatePopularityScore(article);
  const sourceScore = calculateSourceScore(article);
  const noveltyScore = calculateNoveltyScore(article, inferredTags, context.recentHistory);
  const finalScore = roundScore(
    interestScore * 0.52 +
    popularityScore * 0.2 +
    noveltyScore * 0.13 +
    sourceScore * 0.15
  );

  return {
    article,
    inferredTags,
    keywords,
    scores: {
      interest_score: interestScore,
      popularity_score: popularityScore,
      novelty_score: noveltyScore,
      source_score: sourceScore,
      final_score: finalScore
    }
  };
}

function selectPickupArticles(scoredCandidates, limit) {
  const counts = allocateSlotCounts(limit);
  const selectedIds = new Set();
  const selections = [];

  pushSelections(selections, selectedIds, scoredCandidates, counts.interest, 'interest', (item) => (
    item.scores.interest_score * 1.2 + item.scores.final_score
  ));

  pushSelections(selections, selectedIds, scoredCandidates, counts.important, 'important', (item) => (
    item.scores.popularity_score * 1.15 + item.scores.source_score + item.scores.interest_score * 0.35
  ));

  pushSelections(selections, selectedIds, scoredCandidates, counts.exploration, 'exploration', (item) => (
    item.scores.novelty_score * 1.4 + item.scores.interest_score * 0.2 + item.scores.final_score * 0.3
  ));

  if (selections.length < limit) {
    pushSelections(selections, selectedIds, scoredCandidates, limit - selections.length, 'interest', (item) => item.scores.final_score);
  }

  return selections.slice(0, limit).map((selection) => ({
    ...selection,
    reason: buildSelectionReason(selection)
  }));
}

function pushSelections(target, selectedIds, candidates, count, slot, ranker) {
  if (count <= 0) {
    return;
  }

  const sorted = [...candidates]
    .filter((candidate) => !selectedIds.has(candidate.article.id))
    .sort((left, right) => {
      const delta = ranker(right) - ranker(left);
      if (delta !== 0) {
        return delta;
      }
      return right.article.id - left.article.id;
    });

  for (const item of sorted.slice(0, count)) {
    selectedIds.add(item.article.id);
    target.push({
      article: item.article,
      scores: item.scores,
      slot
    });
  }
}

function buildSelectionReason(selection) {
  switch (selection.slot) {
    case 'interest':
      return `interest_score=${selection.scores.interest_score} final_score=${selection.scores.final_score}`;
    case 'important':
      return `popularity_score=${selection.scores.popularity_score} source_score=${selection.scores.source_score}`;
    case 'exploration':
      return `novelty_score=${selection.scores.novelty_score} final_score=${selection.scores.final_score}`;
    default:
      return `final_score=${selection.scores.final_score}`;
  }
}

function allocateSlotCounts(limit) {
  if (limit <= 1) {
    return { interest: 1, important: 0, exploration: 0 };
  }

  if (limit === 2) {
    return { interest: 1, important: 1, exploration: 0 };
  }

  if (limit === 3) {
    return { interest: 2, important: 1, exploration: 0 };
  }

  if (limit === 4) {
    return { interest: 3, important: 1, exploration: 0 };
  }

  if (limit === 5) {
    return { interest: 3, important: 1, exploration: 1 };
  }

  if (limit === 10) {
    return { interest: 7, important: 2, exploration: 1 };
  }

  let interest = Math.max(1, Math.round(limit * 0.7));
  let important = Math.max(1, Math.round(limit * 0.2));
  let exploration = Math.max(1, limit - interest - important);

  while (interest + important + exploration > limit) {
    if (interest >= important && interest > 1) {
      interest -= 1;
    } else if (important > 1) {
      important -= 1;
    } else {
      exploration -= 1;
    }
  }

  while (interest + important + exploration < limit) {
    interest += 1;
  }

  return { interest, important, exploration };
}

function calculateInterestScore(article, inferredTags, keywords, profile) {
  let score = 0;

  for (const tag of inferredTags) {
    score += profile.tagWeights.get(tag) || 0;
  }

  for (const keyword of keywords) {
    score += profile.keywordWeights.get(keyword) || 0;
  }

  score += profile.sourceWeights.get(article.source) || 0;
  score += calculateGameDevBoost(article, inferredTags);

  return roundScore(score);
}

function calculatePopularityScore(article) {
  let score = POPULARITY_SCORES[article.source] || 6;
  const text = normalizeText([article.title, article.raw_excerpt].join(' '));

  if (text.includes('system card')) score += 4;
  if (text.includes('security') || text.includes('脆弱性')) score += 3;
  if (text.includes('release') || text.includes('introducing')) score += 2;

  return roundScore(score);
}

function calculateSourceScore(article) {
  return roundScore(SOURCE_SCORES[article.source] || 5);
}

function calculateNoveltyScore(article, inferredTags, recentHistory) {
  const sourceCount = recentHistory.sourceCounts.get(article.source) || 0;
  const sourceNovelty = recentHistory.sampleSize === 0
    ? 10
    : Math.max(0, 12 - sourceCount * 1.5);

  let tagNovelty = 0;
  for (const tag of inferredTags) {
    const count = recentHistory.tagCounts.get(tag) || 0;
    tagNovelty += Math.max(0, 6 - count);
  }

  return roundScore(sourceNovelty + Math.min(tagNovelty, 12));
}

function inferCandidateTags(article) {
  const text = normalizeText([article.title, article.raw_excerpt, article.source].filter(Boolean).join(' '));
  const tags = new Set();

  for (const entry of TAG_PATTERNS) {
    if (entry.patterns.some((pattern) => text.includes(pattern))) {
      tags.add(entry.tag);
    }
  }

  if (article.source === 'openai_blog') tags.add('AI');
  if (article.source === 'github_blog') tags.add('GitHub');
  if (article.source === 'cloudflare_blog') tags.add('Cloudflare');
  if (article.source === 'qiita' || article.source === 'zenn') tags.add('Web');

  return Array.from(tags);
}

function calculateGameDevBoost(article, inferredTags) {
  const text = normalizeText([article.title, article.raw_excerpt].filter(Boolean).join(' '));
  let matchCount = 0;

  for (const pattern of GAME_DEV_KEYWORD_PATTERNS) {
    if (text.includes(pattern)) {
      matchCount += 1;
    }
  }

  let score = Math.min(matchCount * 4.5, 28);

  if (article.source === 'unity_blog') {
    score += 6;
  }

  if (inferredTags.includes('GameDev')) {
    score += 4;
  }

  if (inferredTags.includes('Unity')) {
    score += 3;
  }

  return roundScore(score);
}

function extractKeywords(values) {
  const seen = new Set();
  const tokens = [];

  for (const value of values) {
    const normalized = normalizeText(value || '');
    for (const token of normalized.split(/[^a-z0-9_\-]+/)) {
      if (token.length < 4) {
        continue;
      }

      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
  }

  return tokens;
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function getInterestWeightMultiplier(interestWeightMap, tag) {
  if (!interestWeightMap.has(tag)) {
    return 1;
  }

  const raw = Number(interestWeightMap.get(tag));
  if (!Number.isFinite(raw)) {
    return 1;
  }

  return 0.7 + raw / 100;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function addWeight(map, key, value) {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) || 0) + value);
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}
