# Production Setup

## Goal

本番用PCで、このアプリを新しい SQLite DB から起動し、Cloudflare Tunnel 設定前の動作確認まで進める手順です。

## 1. リポジトリを取得する

```bash
git clone https://github.com/427harinn/tech-catchup.git
cd tech-catchup
```

## 2. `.env` を作成する

`.env.example` を元に `.env` を作成します。

PowerShell:

```powershell
Copy-Item .env.example .env
```

設定する主な値:

```env
NODE_ENV=development
BACKEND_PORT=3000
FRONTEND_PORT=5173

DATABASE_PATH=/app/data/app.db
VITE_API_BASE_URL=http://localhost:3000

NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=2e1142dd-9a17-4aa6-954f-8e969844674c
```

補足:

- SQLite は新しい DB で開始する想定です
- 既存 DB を引き継ぐ場合だけ `backend/data/app.db` をコピーします

## 3. Docker Compose で起動する

```bash
docker compose up -d --build
```

## 4. 起動確認

フロント:

```text
http://localhost:5173
```

バックエンドヘルスチェック:

```text
http://localhost:3000/api/health
```

## 5. 最低限の動作確認

### RSS取得

画面上部の `RSS取得` ボタン、または API で確認します。

```bash
curl -X POST http://localhost:3000/api/rss/fetch
```

### 要約済み表示

要約済み記事がある場合:

```bash
curl http://localhost:3000/api/articles?status=summarized
```

### Notionキュー確認

```bash
curl http://localhost:3000/api/notion/queue
```

### Notion 1件手動同期

```bash
docker compose exec backend npm run notion:sync -- <queueId>
```

### Notion queued 一括同期

```bash
docker compose exec backend npm run notion:sync:queued -- --limit 5
```

## 6. ログ確認

```bash
docker compose logs -f
```

サービス別:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## 7. 停止

```bash
docker compose down
```

## 8. 次の作業

本番用PCで以下が確認できたら、Cloudflare Tunnel 設定に進みます。

- `http://localhost:5173` が開く
- `http://localhost:3000/api/health` が成功する
- RSS取得が動く
- 要約済み記事が表示される
- Notion同期が1件以上成功する
