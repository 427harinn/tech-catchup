# Web から取得＆要約を実行する

## 概要

画面の `取得＆要約` ボタンは、backend コンテナから PowerShell を直接実行しません。

代わりに次の流れで動きます。

```text
React の取得＆要約ボタン
↓
POST /api/jobs/fetch-and-summarize
↓
backend が jobs テーブルに queued ジョブを登録
↓
backend が Windows ホスト側 runner server に通知
↓
runner server が scripts/run-fetch-and-summarize-job.ps1 を起動
↓
run-fetch-and-summarize-job.ps1 が queued ジョブを処理
↓
jobs が running → succeeded / failed / skipped になる
↓
画面は latest API を polling して状態表示
```

## ボタンを押したときの挙動

- ジョブ登録は backend が行う
- runner server 通知に成功すれば、ほぼリアルタイムで Windows 側処理が始まる
- runner server が停止中でもジョブ登録自体は成功し、`queued` のまま残る
- その場合は後から runner を起動して処理できる

## 画面で見える状態

- `queued`: ジョブ登録済み、まだ未実行
- `running`: Windows runner が実行中
- `succeeded`: 処理完了
- `failed`: 実行失敗
- `skipped`: 既存ロックなどでスキップ

成功またはスキップ時は `attempted / succeeded / failed` を表示します。

通常運用では `scripts/fetch-and-summarize.ps1` が最大 10 件を処理します。
スコアピックアップを使う場合の目安配分は `interest 7 / important 2 / exploration 1` です。
5件に戻したい場合は PowerShell から `.\scripts\fetch-and-summarize.ps1 -Limit 5` を使えます。

## API

ジョブ登録:

```text
POST /api/jobs/fetch-and-summarize
```

最新ジョブ確認:

```text
GET /api/jobs/fetch-and-summarize/latest
```

runner 用:

```text
GET /api/jobs/fetch-and-summarize/next
POST /api/jobs/:id/start
POST /api/jobs/:id/complete
POST /api/jobs/:id/fail
```

## 既存フローとの関係

- `scripts/fetch-and-summarize.ps1` はそのまま使う
- タスクスケジューラ実行もそのまま残す
- Notion 同期はこのボタン処理に含めない
- `試したい` を押したときだけ Notion 側の既存フローを使う

## 確認ポイント

ジョブ状態:

```text
GET /api/jobs/fetch-and-summarize/latest
```

要約済み記事:

```text
GET /api/articles?status=summarized&sort=updated_desc&limit=10
```

実行ログ:

```powershell
Get-Content "C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.log" -Tail 80
```

runner server ログ:

```powershell
Get-Content "C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\runner-server.log" -Tail 80
```

## 関連資料

- runner server の起動方法とトラブル対応: [docs/runner-server.md](/abs/c:/Users/User/Documents/GitHub/tech-catchup/docs/runner-server.md:1)
- タスクスケジューラ運用: [docs/scheduler.md](/abs/c:/Users/User/Documents/GitHub/tech-catchup/docs/scheduler.md:1)
