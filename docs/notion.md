# Notion Sync Notes

## Scope

Phase 4では、`notion_queue` に入っている `try_later` の記事だけを Notion に同期します。

## Required Environment Variables

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

`.env.example` に定義済みです。実際の値は `.env` に設定してください。

## Queue List API

```http
GET /api/notion/queue
```

未同期または失敗済みの `try_later` キューを一覧します。

## Manual Sync API

```http
POST /api/notion/queue/:id/sync
```

指定したキューIDの1件を Notion に保存します。成功すると `notion_queue.status` は `synced` になり、`notion_page_id` と `synced_at` が更新されます。失敗した場合は `failed` になります。

## Manual Sync CLI

```bash
docker compose exec backend npm run notion:sync -- 1
```

## Queued Batch Sync CLI

```bash
docker compose exec backend npm run notion:sync:queued -- --limit 5
```

- `status = queued` の `try_later` キューだけを対象にします
- 1件ずつ順番に同期します
- 途中で1件失敗しても残りは続行します
- 最後に成功件数・失敗件数・各キューの結果を表示します

## Notion Property Mapping

- `タイトル` ← `article.title`
- `URL` ← `article.url`
- `ステータス` ← 固定で `試したい`
- `優先度` ← `summary.priority` を `高 / 中 / 低` に変換
- `分野` ← `summary.tags` のうち Notion 側の選択肢にあるものだけ保存
- `要約` ← `summary.summary_short`
- `自分に関係ある理由` ← `summary.relevance`
- `次にやること` ← `summary.next_action`
- `登録日` ← 同期日時
- `情報源` ← `article.source` を Notion 側の選択肢へ変換
- `元記事ID` ← `article.id`

## Conversion Rules

### 優先度

- `priority` 4〜5 → `高`
- `priority` 2〜3 → `中`
- `priority` 1 → `低`
- `priority` がない場合 → `中`

### 分野

Notion 側の既知選択肢だけを保存します。

- `AI`
- `Unity`
- `Web`
- `3D`
- `業務システム`
- `Cloudflare`
- `Notion`
- `GitHub`
- `React`
- `Firebase`
- `セキュリティ`
- `ローカルLLM`
- `自動化`

### 情報源

- `zenn` → `Zenn`
- `qiita` → `Qiita`
- `github_blog` → `GitHub`
- `openai_blog` → `OpenAI Blog`
- `cloudflare_blog` → `Cloudflare Blog`
- `manual` → `手動登録`
- その他 → `Blog`

## Notes

- `後で読む` は Notion に同期しません
- 記事本文全文は Notion に保存しません
- 手動同期から始めて、後で自動同期に拡張する前提です
