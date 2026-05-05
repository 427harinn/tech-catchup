# Summary Workflow

## Goal

Phase 3では、Codexが要約した結果をAPIで保存し、アプリ上で表示できる状態を作ります。

## 1. 未要約記事を取得する

```http
GET /api/articles/unsummarized?limit=10
```

必要に応じて `include_failed=false` を付けると、失敗済み記事を除外できます。

レスポンス例:

```json
{
  "articles": [
    {
      "id": 123,
      "title": "Example title",
      "url": "https://example.com",
      "source": "qiita",
      "published_at": "2026-05-01T00:00:00.000Z",
      "raw_excerpt": "short excerpt",
      "status": "new"
    }
  ],
  "count": 1
}
```

## 2. Codexで要約する

プロンプトは [prompts/article_summary.md](/abs/c:/Users/rinnr/Documents/GitHub/tech-catchup/prompts/article_summary.md:1) を使います。

## 3. 要約結果を保存する

```http
POST /api/articles/:id/summary
Content-Type: application/json

{
  "summary_short": "3行程度の要約",
  "tech_points": "技術的に重要なポイント",
  "relevance": "自分に関係ある理由",
  "tags": ["AI", "Web", "Cloudflare"],
  "priority": 4
}
```

成功すると `summaries` に保存され、`articles.status` は `summarized` に更新されます。

## 4. 要約失敗を記録する

```http
POST /api/articles/:id/summary
Content-Type: application/json

{
  "status": "failed"
}
```

この場合は `articles.status` が `failed` に更新されます。

## Notes

- 要約対象は元記事の代替にならない粒度に留めます
- 記事本文全文はDBやNotionに保存しません
- 元記事URLは必ず保持します
- Notion同期対象は `try_later` のみです
