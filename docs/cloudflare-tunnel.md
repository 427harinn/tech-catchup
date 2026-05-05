# Cloudflare Tunnel Setup

## Goal

Cloudflare Tunnel で本番用 PC のアプリを外部公開する手順をまとめます。

この Phase では、公開 URL を 1 つにまとめる前提です。

```text
https://public.example.com
  /        -> backend が配信する React frontend
  /api/*   -> backend API
```

これにより、Cloudflare Tunnel で公開するローカル宛先は `http://localhost:3000` だけで済みます。

## Current Architecture

開発時:

```text
browser
  -> http://localhost:5173
  -> Vite dev server
  -> /api は backend:3000 へ proxy
```

本番公開時:

```text
browser
  -> https://public.example.com
  -> Cloudflare Tunnel
  -> http://localhost:3000
  -> backend が frontend と /api の両方を配信
```

## Recommendation

今回の構成では、まずは `cloudflared` をホスト PC 側で動かす方法を推奨します。

理由:

- Docker Compose のアプリ本体と Tunnel を分離できる
- 切り分けがしやすい
- Windows 再起動後の自動起動をサービス化しやすい
- 公開先を `localhost:3000` ひとつに固定しやすい

## Option 1: Run `cloudflared` On Host PC

### Pros

- Compose の変更が少ない
- `localhost:3000` にそのまま転送できる
- Windows サービス化しやすい

### Cons

- ホスト側に `cloudflared` のインストールが必要
- 構成が Docker だけでは完結しない

### Rough Steps

1. Cloudflare Zero Trust で Tunnel を作成する
2. Public Hostname を追加する
3. 宛先を `http://localhost:3000` に設定する
4. Windows に `cloudflared` をインストールする
5. Tunnel を接続する
6. Cloudflare Access をかける
7. Windows サービスとして自動起動させる

## Option 2: Run `cloudflared` In Docker Compose

### Pros

- Compose にまとめて起動できる
- コンテナログで確認しやすい

### Cons

- Tunnel 設定ファイルや認証情報のマウントが必要
- Docker Desktop の起動に依存する
- 最初の切り分けが少し複雑になる

### Rough Steps

1. Cloudflare Zero Trust で Tunnel を作成する
2. 認証情報を取得する
3. `cloudflared` サービスを Compose に追加する
4. 転送先を `http://backend:3000` にする
5. Access を設定する

## Which Fits This Project

現時点では `Option 1` が向いています。

理由:

- アプリ本体はすでに Docker Compose で安定している
- 公開対象は `localhost:3000` ひとつでよい
- frontend と backend を同一 origin に寄せたので Tunnel 側の構成も単純

## Cloudflare Access

自分だけアクセスできるようにする基本手順です。

1. Zero Trust Dashboard を開く
2. `Access` で Self-hosted application を追加する
3. 公開 hostname を設定する
4. Policy を `Allow` にする
5. 許可対象を自分のメールアドレスだけにする
6. ブラウザでアクセスし、Access ログイン後に画面が出ることを確認する

推奨:

- 最初は自分のメール 1 件だけを許可する
- backend 用の別 hostname は作らない

## Auto Start After Reboot

本番用 PC の再起動後は、次の 2 つが自動で戻るようにします。

1. Docker Desktop
2. `cloudflared`

アプリ側:

- Docker Desktop の自動起動を有効にする
- `docker-compose.yml` の `restart: unless-stopped` を維持する

Tunnel 側:

- `cloudflared service install` を使って Windows サービス化する
- サービスのスタートアップ種類を `Automatic` にする

## Troubleshooting

アプリ確認:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
curl http://localhost:3000/api/health
curl http://localhost:3000/api/articles
curl http://localhost:3000
```

ホスト側 Tunnel 確認:

```powershell
cloudflared --version
cloudflared tunnel list
cloudflared tunnel info <TUNNEL_NAME_OR_ID>
Get-Service cloudflared
Get-Service cloudflared | Format-List *
```

Compose 方式の Tunnel 確認:

```powershell
docker compose logs -f cloudflared
docker compose exec cloudflared cloudflared --version
```

外部疎通確認:

```powershell
curl https://public.example.com
```

## Development Vs Production

開発時:

- 画面は `http://localhost:5173`
- API は `http://localhost:3000/api/*`
- frontend の `/api` 呼び出しは Vite proxy 経由で backend に届く

本番公開時:

- 画面は `http://localhost:3000`
- API も `http://localhost:3000/api/*`
- Cloudflare Tunnel は `http://localhost:3000` だけを公開する

## Next Step

この手順書の次は、実際に Cloudflare Zero Trust 側で Tunnel を作成し、`localhost:3000` を公開先に設定します。
