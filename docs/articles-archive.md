# 記事整理

`archived_at` を使って古い記事を非表示にする運用です。

## 方針

- 物理削除はしません
- 通常一覧では `archived_at IS NULL` の記事だけ表示します
- archive 済み記事は DB に残ります
- 確認したいときだけ `include_archived=true` で一覧取得します

## 整理ルール

- 反応なしの記事:
  要約後 3 日以上で archive
- `not_interested` の記事:
  反応後 1 日以上で archive
- `interested` の記事:
  反応後 7 日以上で archive
- `try_later` かつ Notion 同期済み:
  `synced_at` から 3 日以上で archive
- `try_later` かつ Notion 未同期または失敗中:
  archive しません

件数整理も入っています。

- 通常表示は最新 20 件前後を目安にします
- ただし件数整理の対象は通常の `summarized` 記事だけです
- `interested` / `try_later` / Notion 未同期記事は件数整理から除外します

## 実行方法

dry-run:

```powershell
docker compose exec backend npm run articles:archive-old -- --dry-run
```

実行:

```powershell
docker compose exec backend npm run articles:archive-old
```

表示件数の基準を変える場合:

```powershell
docker compose exec backend npm run articles:archive-old -- --visible-target 20
```

## 出力

CLI は次の JSON を返します。

- `checked`
- `archived`
- `skipped`
- `archived_articles`
- `skipped_articles`

`archived_articles` と `skipped_articles` には `article_id`, `title`, `status`, `reason` が入ります。

## API での確認

通常一覧:

```text
GET /api/articles
```

archive 済みも含めて確認:

```text
GET /api/articles?include_archived=true
```

並び替えつきの例:

```text
GET /api/articles?sort=updated_desc&include_archived=true
```

## 確認ポイント

- `try_later` でも `queued` / `failed` の Notion 項目がある記事は残る
- archive 済み記事は通常一覧に出ない
- `include_archived=true` では見える
- `archived_at` が入るだけで、元データは削除されない
