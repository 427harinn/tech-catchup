# Runner Server

## 役割

runner server は Windows ホスト側で動くローカル専用サーバーです。

- backend からの通知を受ける
- 許可済みの job type だけを固定処理で実行する
- PowerShell runner を起動する
- 実行ログを残す

backend コンテナは `powershell.exe` や Codex CLI を直接実行しません。

## 対応ジョブ種別

現在対応:

- `fetch_and_summarize`
- `summarize_link`

未対応の job type は明示的に拒否します。

## 関連ファイル

- server: `scripts/runner-server.js`
- 起動: `scripts/start-runner-server.ps1`
- 停止: `scripts/stop-runner-server.ps1`
- 状態確認: `scripts/check-runner-server.ps1`
- 直接通知テスト: `scripts/test-runner-server.ps1`
- backend 経由一括確認: `scripts/check-fetch-and-summarize-flow.ps1`
- PowerShell runner: `scripts/run-fetch-and-summarize-job.ps1`
- PowerShell runner: `scripts/run-summarize-link-job.ps1`
- 実処理本体: `scripts/fetch-and-summarize.ps1`

## 起動方法

通常は次で起動します。

```powershell
.\scripts\start-runner-server.ps1
```

このスクリプトは次を行います。

- リポジトリ直下へ移動
- `.env` から `RUNNER_SERVER_TOKEN` と `RUNNER_SERVER_PORT` を読む
- `node .\scripts\runner-server.js` を起動
- `logs/runner-server.log` にログを残す
- 既に起動中なら二重起動しない

## 停止方法

```powershell
.\scripts\stop-runner-server.ps1
```

## 状態確認方法

```powershell
.\scripts\check-runner-server.ps1
```

確認内容:

- `http://127.0.0.1:3900/health` の疎通
- `RUNNER_SERVER_TOKEN` を読めているか
- PID ファイルの有無
- 実プロセスの有無
- `logs/runner-server.log` の末尾

## 直接テスト方法

```powershell
.\scripts\test-runner-server.ps1
```

このスクリプトは次を行います。

- `.env` から `RUNNER_SERVER_TOKEN` を読む
- `POST http://127.0.0.1:3900/run-job`
- body として `{"type":"fetch_and_summarize"}` を送る
- `accepted / already_running / error` を表示する
- その後 `GET /api/jobs/fetch-and-summarize/latest` を確認する

## backend 経由の確認方法

```powershell
.\scripts\check-fetch-and-summarize-flow.ps1
```

このスクリプトは次を行います。

1. `http://localhost:3000/api/health` を確認
2. `http://127.0.0.1:3900/health` を確認
3. `POST /api/jobs/fetch-and-summarize` でジョブ作成
4. runner 通知結果を表示
5. `latest` を polling
6. `queued → running → succeeded / failed / skipped` を表示
7. 最後に `attempted / succeeded / failed / processed_articles` を表示

## backend 側の関連環境変数

- `RUNNER_SERVER_URL`
  例: `http://host.docker.internal:3900`
- `RUNNER_SERVER_TOKEN`
- `RUNNER_SERVER_NOTIFY_TIMEOUT_MS`

通知失敗でもジョブ登録自体は成功し、`queued` のまま残ります。

## セキュリティ

- runner server は任意コマンドを受け取りません
- `POST /run-job` で受け取るのは `type` または `job_type` のみです
- 実行される処理は server 内の固定ディスパッチだけです
- `x-runner-token` が一致しないリクエストは拒否します
- 既定では `127.0.0.1:3900` で待ち受けます

注意:

- `127.0.0.1` 待受のままだと、環境によっては Docker から `host.docker.internal:3900` で届かない場合があります
- その場合は backend 通知が失敗してもジョブは `queued` に残ります
- 後から `.\scripts\run-fetch-and-summarize-job.ps1` で手動処理できます

## ログ

runner server:

```text
logs/runner-server.log
```

PowerShell 実処理:

```text
logs/fetch-and-summarize.log
```

確認例:

```powershell
Get-Content ".\logs\runner-server.log" -Tail 80
Get-Content ".\logs\fetch-and-summarize.log" -Tail 80
```

## よくあるエラー

### token 不一致で 401

- `.env` の `RUNNER_SERVER_TOKEN` を確認
- backend 側と Windows 側で同じ値を使っているか確認

### runner server 未起動

- `.\scripts\check-runner-server.ps1` を実行
- `GET /health` が通るか確認

### queued のまま進まない

- runner server が起動中か確認
- `logs/runner-server.log` に通知受信ログがあるか確認
- backend から `host.docker.internal:3900` に到達できているか確認
- 必要なら `.\scripts\run-fetch-and-summarize-job.ps1` を手動実行

### lock により skipped

- `logs/fetch-and-summarize.lock` が残っていないか確認
- タスクスケジューラ実行や手動実行と重なっていないか確認

### PowerShell 起動失敗

- `logs/runner-server.log` に `Runner child start failure` が出ていないか確認
- `powershell.exe` が通常の Windows PowerShell として使えるか確認
- `scripts/run-fetch-and-summarize-job.ps1` を単体実行して再現するか確認

## Codex で確認するときの手順

1. `.\scripts\start-runner-server.ps1` で起動
2. `.\scripts\check-runner-server.ps1` で health と PID を確認
3. `.\scripts\test-runner-server.ps1` で直接通知確認
4. `.\scripts\check-fetch-and-summarize-flow.ps1` で backend 経由の一連確認
5. 必要に応じて `logs/runner-server.log` と `logs/fetch-and-summarize.log` を確認
