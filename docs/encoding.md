# Encoding Notes

## Cut Point

今回の日本語 `????` 化けは、APIレスポンス返却時ではなく保存前の入力段階で起きていました。

確認結果:

- `GET /api/articles/:id` のレスポンスヘッダーは `application/json; charset=utf-8`
- SQLiteに保存されている値自体が `?` になっていた
- そのため、ExpressやSQLiteが日本語を壊したのではなく、要約保存リクエストの本文が壊れた状態で届いていました

## Likely Cause

Windows PowerShell の `Invoke-RestMethod` で、日本語を含むJSON文字列をそのまま `-Body` に渡したときに、文字コードや実行環境の都合で `?` に変換される場合があります。

## Safe Ways To Send UTF-8 JSON

### 1. curl.exe で UTF-8 JSON ファイルを送る

```bash
curl.exe -X POST "http://localhost:3000/api/articles/74/summary" ^
  -H "Content-Type: application/json; charset=utf-8" ^
  --data-binary "@backend/src/scripts/sample-summary-ja.json"
```

PowerShellでは1行で使う方が安全です。

```powershell
curl.exe -X POST "http://localhost:3000/api/articles/74/summary" -H "Content-Type: application/json; charset=utf-8" --data-binary "@backend/src/scripts/sample-summary-ja.json"
```

### 2. Node.js スクリプトで送る

Dockerコンテナ内から送る場合:

```bash
docker compose exec backend npm run summary:post -- 74
```

任意のJSONファイルを指定する場合:

```bash
docker compose exec backend npm run summary:post -- 74 src/scripts/sample-summary-ja.json
```

### 3. PowerShellで送るなら UTF-8 ファイルを明示して読む

```powershell
$body = Get-Content -Raw -Encoding utf8 .\backend\src\scripts\sample-summary-ja.json
Invoke-RestMethod -Uri "http://localhost:3000/api/articles/74/summary" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

## Notes

- 日本語を含む要約は、文字列リテラルをその場で組み立てるより、UTF-8ファイル経由の方が安全です
- `curl.exe` を使う場合は `--data-binary` を使うと余計な変換が入りにくくなります
