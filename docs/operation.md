# Operation Guide

## Goal

本番用 PC でこのアプリを日常運用するときの確認手順と、再起動後の復旧手順をまとめます。

今回の前提:

- 外部アクセスは Tailscale を使う
- PC 上の確認 URL は `http://localhost:3000`
- スマホからの確認 URL は `http://<Tailscale IP>:3000`
- アプリ本体は Docker Compose で動かす

## Daily Check

通常時は次の順で見れば十分です。

1. Tailscale が接続済み
2. Docker Desktop が起動済み
3. backend / frontend コンテナが起動済み
4. PC 上で `http://localhost:3000` が開く
5. スマホから `http://<Tailscale IP>:3000` が開く

## After Reboot Checklist

Windows 再起動後は次の順で確認します。

### 1. Tailscale

確認方法:

- タスクトレイに Tailscale アイコンが出ている
- 接続済み表示になっている

PowerShell:

```powershell
tailscale status
tailscale ip -4
```

確認ポイント:

- 本番 PC がオンライン
- Tailscale IP が取得できている

### 2. Docker Desktop

確認ポイント:

- Docker Desktop が自動起動している
- Docker エンジンが起動完了している

PowerShell:

```powershell
docker version
docker compose ps
```

### 3. App Containers

PowerShell:

```powershell
docker compose ps
docker compose logs --tail 50 backend
docker compose logs --tail 50 frontend
```

期待する状態:

- `backend` が `running`
- `frontend` が `running`

このリポジトリの `docker-compose.yml` では `restart: unless-stopped` が設定されているため、Docker Desktop が正常に立ち上がればコンテナも自動復旧する想定です。

### 4. PC Local Access

PowerShell:

```powershell
curl http://localhost:3000/api/health
curl http://localhost:3000
```

確認ポイント:

- `/api/health` が `200`
- `http://localhost:3000` で React 画面が返る

### 5. Smartphone Access

確認ポイント:

- スマホの Tailscale が接続済み
- スマホのブラウザで `http://<Tailscale IP>:3000` が開く

この URL が開けば、画面と API の両方が同じ origin で動きます。

## Normal Startup

通常の起動:

```powershell
docker compose up -d
```

イメージ更新やコード変更後の再ビルドを含む起動:

```powershell
docker compose up -d --build
```

ログ確認:

```powershell
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
```

停止:

```powershell
docker compose down
```

## Recovery If Containers Did Not Return

再起動後にコンテナが戻っていない場合は次の順で切り分けます。

1. Docker Desktop が起動しているか確認する
2. `docker compose ps` を見る
3. 必要なら手動で起動する

```powershell
docker compose up -d
```

4. 起動しない場合はログを確認する

```powershell
docker compose logs --tail 100 backend
docker compose logs --tail 100 frontend
```

## If Tailscale Did Not Reconnect

1. タスクトレイの Tailscale アイコンを確認する
2. サインアウト状態でないか確認する
3. `tailscale status` を実行する
4. 必要なら Tailscale アプリを開いて再接続する

PowerShell:

```powershell
tailscale status
tailscale ip -4
```

スマホから開けないときも、まず PC 側で `http://localhost:3000` が開くか確認してから Tailscale 側を疑うと切り分けやすいです。

## Optional: Run `docker compose up -d` At Windows Login

基本的には次の条件がそろえば、明示的な自動実行は不要です。

- Docker Desktop が自動起動する
- Docker Desktop が前回の Compose コンテナを復元する
- `restart: unless-stopped` が効く

それでも手動復旧を減らしたい場合は、Windows のタスク スケジューラでログイン時に次を実行する運用を検討できます。

```powershell
docker compose up -d
```

運用メモ:

- 実行ディレクトリはリポジトリのルートにする
- Docker Desktop 起動直後すぐは失敗することがあるため、遅延実行のほうが安定しやすい
- まずは手動運用で数回再起動を試して、本当に必要なら追加する

## Recommended Reboot Test

本番運用に入る前に、1 回は再起動試験をしておくと安心です。

手順:

1. Windows を再起動する
2. Tailscale が自動接続されるか確認する
3. Docker Desktop が自動起動するか確認する
4. `docker compose ps` でコンテナが戻るか確認する
5. `http://localhost:3000` を開く
6. スマホで `http://<Tailscale IP>:3000` を開く

## Troubleshooting Commands

```powershell
tailscale status
tailscale ip -4
docker version
docker compose ps
docker compose logs --tail 50 backend
docker compose logs --tail 50 frontend
curl http://localhost:3000/api/health
curl http://localhost:3000
```

## Related Docs

- Tailscale setup: [docs/tailscale.md](/abs/c:/Users/User/Documents/GitHub/tech-catchup/docs/tailscale.md:1)
- Production setup: [docs/production-setup.md](/abs/c:/Users/User/Documents/GitHub/tech-catchup/docs/production-setup.md:1)
