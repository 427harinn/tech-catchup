# Notion Sync Notes

## Goal

`try_later` を押した記事を Notion の「試したい技術DB」に保存する運用をまとめます。

現在の挙動:

1. `try_later` を押す
2. `reactions` に保存する
3. `notion_queue` に `queued` で追加する
4. その直後に Notion への即同期を試す
5. 成功したら `notion_queue.status = synced`
6. 失敗したらキューを残し、あとで再同期できる

## Required Environment Variables

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

これらは `.env` に設定して使います。

## Immediate Sync Behavior

`try_later` 押下時は、キュー保存だけで終わらず、その場で Notion へのページ作成を試します。

### Success

- Notion にページが作成される
- `notion_queue.status` は `synced` になる
- `notion_page_id` と `synced_at` が入る
- 画面には同期成功メッセージを出す

### Failure

- アプリ全体は落とさない
- 画面には「Notion同期に失敗したが、あとで再同期できます」と出す
- キュー項目は残る
- 後から API または CLI で再同期できる

## Queue List API

```http
GET /api/notion/queue
```

`queued` と `failed` の項目を確認できます。

## Manual Sync API

```http
POST /api/notion/queue/:id/sync
```

指定したキュー 1 件を再同期します。

## CLI

### 1 item

```bash
docker compose exec backend npm run notion:sync -- <queueId>
```

### queued / failed items

```bash
docker compose exec backend npm run notion:sync:queued -- --limit 5
```

この CLI は残してあり、即同期に失敗した項目の回収にも使えます。

## Notion Property Mapping

- `タイトル` -> `article.title`
- `URL` -> `article.url`
- `ステータス` -> `試したい`
- `優先度` -> `summary.priority`
- `タグ` -> `summary.tags`
- `要約` -> `summary.summary_short`
- `自分に関係ある理由` -> `summary.relevance`
- `次にやること` -> `summary.next_action`
- `保存日` -> 同期日時
- `情報源` -> `article.source`
- `元記事ID` -> `article.id`

## Notes

- `try_later` 以外のリアクションは Notion へ送らない
- Notion API の設定不足や一時エラーでも記事保存自体は成功させる
- 再同期は API と CLI の両方から行える
