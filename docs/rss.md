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
