# Tech Catchup

個人用の技術キャッチアップ支援ツールです。Phase 1では、Docker Compose上でReact + Viteのフロントエンド、Node.js + ExpressのAPI、SQLiteの永続化DBを起動し、手動URL登録とリアクション保存までを扱います。

## Phase 1でできること

- スマホ向けの記事カードUI
- URLと任意タイトルの手動登録
- 記事一覧表示
- 全件 / 未要約 / 要約済み / 保存済みフィルタ
- 興味ある / 興味なし / 後で読む / 試したい の保存
- 後で読む / 試したい を `notion_queue` に追加
- SQLite DBを `backend/data/app.db` に永続化

## 必要環境

- Docker
- Docker Compose

ローカルにNode.jsを直接入れる前提ではありません。

## 初回セットアップ

必要に応じて `.env.example` を元に `.env` を作成してください。Phase 1では `.env` がなくても既定値で起動できます。

```bash
copy .env.example .env
```

PowerShellの場合:

```powershell
Copy-Item .env.example .env
```

## 起動

```bash
docker compose up -d --build
```

起動後、以下で確認できます。

- フロントエンド: `http://localhost:5173`
- バックエンドAPI: `http://localhost:3000`
- ヘルスチェック: `http://localhost:3000/api/health`

## 停止

```bash
docker compose down
```

## ログ確認

```bash
docker compose logs -f
```

サービス別に見る場合:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## DB初期化

DBはバックエンド起動時に自動で初期化されます。手動で初期化だけ実行したい場合:

```bash
docker compose run --rm backend npm run db:init
```

DBファイルは以下に保存されます。

```text
backend/data/app.db
```

コンテナを再起動・再作成しても、`./backend/data:/app/data` のボリュームによりDB内容は残ります。

## DBバックアップ

Windows PowerShell例:

```powershell
Copy-Item .\backend\data\app.db .\backend\data\app.backup.db
```

日時付きで残す場合:

```powershell
Copy-Item .\backend\data\app.db ".\backend\data\app.$(Get-Date -Format yyyyMMdd-HHmmss).db"
```

## API

### ヘルスチェック

```http
GET /api/health
```

### 記事一覧

```http
GET /api/articles
```

クエリ例:

```http
GET /api/articles?status=new
GET /api/articles?saved=true
```

### URL登録

```http
POST /api/articles
Content-Type: application/json

{
  "url": "https://example.com/article",
  "title": "任意タイトル"
}
```

タイトル未入力の場合はURLをタイトルとして保存します。

### リアクション保存

```http
POST /api/articles/:id/reactions
Content-Type: application/json

{
  "reaction": "interested"
}
```

指定できる値:

- `interested`
- `not_interested`
- `read_later`
- `try_later`

`read_later` と `try_later` は `reactions` に保存したうえで、`notion_queue` にも `queued` として追加します。

## Windowsで常時起動する場合

まずはDocker DesktopをWindows起動時に立ち上がるよう設定し、このリポジトリで以下を実行します。

```powershell
docker compose up -d --build
```

将来的にはWindowsのタスクスケジューラから上記コマンドを実行する運用にできます。Cloudflare TunnelはPhase 5で `cloudflared` コンテナとして追加する想定です。

## 今後のPhase

- Phase 2: RSS取得
- Phase 3: Codex要約連携
- Phase 4: Notion同期
- Phase 5: Cloudflare Tunnel公開
