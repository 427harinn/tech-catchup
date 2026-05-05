# RSS Notes

## Source Config

RSS取得元は [backend/src/config/rssSources.js](/abs/c:/Users/rinnr/Documents/GitHub/tech-catchup/backend/src/config/rssSources.js:1) で管理します。

各ソースの設定項目:

- `id`
- `name`
- `url`
- `enabled`
- `note`

## Manual Fetch

API:

```http
POST /api/rss/fetch
```

CLI:

```bash
docker compose exec backend npm run rss:fetch
```

## Behavior

- 取得記事は `articles` テーブルに保存されます
- 同一URLは重複保存されません
- ソース単位でエラーを切り分けるため、一部失敗でも全体は継続します
- 取得した記事は `source` に `zenn`, `qiita`, `github_blog` などの識別子を保存します

## Content Handling Rules

- RSSではタイトル、URL、概要、公開日を中心に扱います
- 記事本文全文はDBに保存しません
- 元記事URLは必ず保持します
- 将来的にNotion連携をしても、記事本文全文は送らず、必要最小限のメモだけを扱います
- Notionに送る対象は、基本的に `try_later` にした記事のみです
- 将来的に本文取得を実装する場合も、取得頻度を抑えます
- robots.txt や利用規約に反する取得は行いません
- 元記事の代替になるような再配布用途は避けます
