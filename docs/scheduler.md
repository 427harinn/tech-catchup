# Scheduler Guide

## Goal

Windows タスクスケジューラから、Codex CLI を使う RSS 取得 + 要約保存処理を毎日自動実行するための手順です。

この自動実行に含めるのは次の処理だけです。

- RSS取得
- 未要約記事の要約
- summary JSON 保存
- DBへの summary 保存

含めないもの:

- Notion同期
- `try_later` 相当の保存処理

## Preconditions

- Codex CLI にログイン済みの通常Windowsユーザーで実行する
- `SYSTEM` ユーザーでは実行しない
- Docker Desktop が起動している
- `backend` コンテナが起動している
- リポジトリ配置先は `C:\Users\rinnr\Documents\GitHub\tech-catchup`

## Script

実行対象:

```powershell
C:\Users\rinnr\Documents\GitHub\tech-catchup\scripts\fetch-and-summarize.ps1
```

タスクスケジューラで使うコマンド例:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\rinnr\Documents\GitHub\tech-catchup\scripts\fetch-and-summarize.ps1"
```

開始ディレクトリ:

```text
C:\Users\rinnr\Documents\GitHub\tech-catchup
```

## Lock Behavior

`fetch-and-summarize.ps1` には二重実行防止があります。

- 実行開始時に `logs/fetch-and-summarize.lock` を作成する
- 正常終了時も異常終了時も、自分で取得したロックだけ解除する
- すでにロックがある場合は新しい実行を開始せず、ログを残して終了する

確認ファイル:

```text
C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.lock
```

## Task Scheduler Setup

### 1. タスクを作成する

1. タスクスケジューラを開く
2. 右側の `タスクの作成` を押す

### 2. 全般タブ

- 名前: `Tech Catchup Fetch And Summarize`
- 説明: `RSS取得とCodex要約を毎日実行する`
- `ユーザーがログオンしているかどうかにかかわらず実行する` を選ぶ
- 実行ユーザーは Codex CLI にログイン済みの通常ユーザーにする
- `最上位の特権で実行する` は通常は不要
- `構成対象` は利用中の Windows に合わせる

### 3. トリガータブ

1. `新規` を押す
2. `毎日`
3. 実行したい時刻を設定する
4. `有効` をオンにする

例:

- 毎日 07:00

### 4. 操作タブ

1. `新規` を押す
2. 操作: `プログラムの開始`
3. プログラム/スクリプト:

```text
powershell.exe
```

4. 引数の追加:

```text
-ExecutionPolicy Bypass -File "C:\Users\rinnr\Documents\GitHub\tech-catchup\scripts\fetch-and-summarize.ps1"
```

5. 開始:

```text
C:\Users\rinnr\Documents\GitHub\tech-catchup
```

### 5. 条件タブ

必要に応じて設定します。

よくある方針:

- ノートPCなら `AC電源使用時のみ` を外すか検討する
- スリープ復帰で動かしたいなら `スリープを解除して実行` を検討する

### 6. 設定タブ

おすすめ:

- `スケジュールされた開始時刻にタスクを実行できなかった場合、すぐにタスクを実行する`
- `タスクが失敗した場合の再起動` は必要なら設定
- `タスクが既に実行中の場合に適用される規則` は `新しいインスタンスを開始しない`

最後の設定に加えて、スクリプト側でも lock を持っているので二重実行を避けやすくなります。

## Manual Test From Task Scheduler

登録後は、まず手動実行で確認します。

1. タスクスケジューラで該当タスクを選ぶ
2. 右側の `実行` を押す
3. 数分待つ
4. 結果を確認する

## Verification

### 1. ログ確認

ログファイル:

```text
C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.log
```

PowerShell 例:

```powershell
Get-Content "C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.log" -Tail 100
```

確認したい内容:

- `Starting fetch-and-summarize`
- `rss:fetch completed`
- 各記事の `Summary JSON saved`
- 各記事の `status=summarized`
- 最後の `attempted / succeeded / failed / results`

### 2. JSONファイル確認

保存先:

```text
C:\Users\rinnr\Documents\GitHub\tech-catchup\backend\src\scripts
```

例:

```powershell
Get-ChildItem "C:\Users\rinnr\Documents\GitHub\tech-catchup\backend\src\scripts\summary-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

### 3. 画面反映確認

- アプリ画面を開く
- 要約対象の記事が `summarized` として表示されることを確認する

### 4. ロック確認

実行中のみ lock が存在することを確認します。

```powershell
Test-Path "C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.lock"
```

- 実行中: `True`
- 終了後: `False`

## Troubleshooting

### ログインしていないユーザーで失敗する

- タスクの実行ユーザーが、Codex CLI にログイン済みの Windows ユーザーか確認する
- `SYSTEM` を使わない

### Dockerが起動していない

PowerShell:

```powershell
docker compose ps
```

`backend` が `running` か確認します。

### lock が残っていて動かない

まず本当に別実行がないか確認します。別実行がないのに lock が残っている場合だけ削除します。

```powershell
Remove-Item "C:\Users\rinnr\Documents\GitHub\tech-catchup\logs\fetch-and-summarize.lock" -Force
```

### Codex CLI 実行で失敗する

- 対象ユーザーで手動実行して再現する
- `logs/fetch-and-summarize.log` の `codex article ...` 周辺を見る

### 手動実行確認コマンド

```powershell
Set-Location "C:\Users\rinnr\Documents\GitHub\tech-catchup"
powershell.exe -ExecutionPolicy Bypass -File ".\scripts\fetch-and-summarize.ps1"
```
