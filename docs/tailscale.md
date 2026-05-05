# Tailscale Setup

## Goal

Cloudflare Tunnel の代わりに Tailscale を使って、本番用 PC とスマホだけがこのアプリにアクセスできる構成にします。

今回の方針:

- ドメインは買わない
- 自宅 IP は公開しない
- 本番 PC とスマホを同じ Tailscale tailnet に入れる
- スマホから `http://<Tailscale IP>:3000` にアクセスする
- 一般公開はしない

## Architecture

```text
smartphone
  -> Tailscale
  -> http://<Windows PC Tailscale IP>:3000
  -> backend が frontend と /api の両方を配信
```

前提:

- Docker Compose でアプリが起動している
- backend は `0.0.0.0:3000` で待ち受けている
- `http://localhost:3000` で本番用 PC 上から画面が開く

## 1. Install Tailscale On The Windows PC

### GUI install

1. `https://tailscale.com/download/windows` を開く
2. Windows 版インストーラーをダウンロードする
3. インストーラーを実行する
4. インストール後、タスクトレイに Tailscale アイコンが出る
5. Tailscale アイコンから `Log in` を選ぶ

### Sign in

1. ブラウザが開いたら、使いたいアカウントでログインする
2. そのアカウントで tailnet を作成する
3. Windows PC が `Machines` 一覧に出ることを確認する

## 2. Install Tailscale On The Smartphone

### iPhone / iPad

1. App Store で `Tailscale` をインストールする
2. アプリを開く
3. `Get Started` を選ぶ
4. VPN 構成の追加を許可する
5. Windows PC と同じアカウントでログインする

### Android

1. Google Play で `Tailscale` をインストールする
2. アプリを開く
3. `Get Started` を選ぶ
4. VPN 構成の追加を許可する
5. Windows PC と同じアカウントでログインする

## 3. Use The Same Tailscale Account

本番用 PC とスマホは、必ず同じ Tailscale アカウントでログインします。

確認ポイント:

- Tailscale 管理画面の `Machines` に PC とスマホの両方が表示される
- どちらもオンラインになっている

個人用途なら、同一アカウントにそろえるのがいちばん簡単です。

## 4. Find The Windows PC Tailscale IP

確認方法は 3 つあります。

### Windows アプリ画面

- タスクトレイの Tailscale アイコンを開く
- 接続状態の画面で Tailscale IP を確認する

### PowerShell

```powershell
tailscale ip -4
```

### Tailscale Admin Console

- `https://login.tailscale.com/admin/machines` を開く
- Windows PC の行を見る
- `100.x.y.z` 形式の Tailscale IP を確認する

## 5. Check Access From The Smartphone

1. 本番用 PC でアプリを起動する

```powershell
docker compose up -d
```

2. 本番用 PC でローカル確認する

```powershell
curl http://localhost:3000/api/health
```

3. スマホで Tailscale を接続状態にする
4. スマホのブラウザで次を開く

```text
http://<Tailscale IP>:3000
```

5. 画面が表示されることを確認する
6. 一覧表示や RSS 取得など、API を使う画面操作ができることを確認する

補足:

- 今回のアプリは単一 origin 化済みなので、`3000` だけ見えれば画面と API の両方が動く
- `5173` は開発用なのでスマホ確認には使わない

## 6. Windows Firewall Checks

Tailscale 自体は多くの環境で追加ポート開放なしに動きます。

ただし、今回必要なのは「Windows PC 上のアプリが Tailscale ネットワークから `3000` 番へ到達できること」です。

確認ポイント:

1. `docker compose ps` で backend が起動している
2. backend が `0.0.0.0:3000` で待ち受けている
3. スマホから `http://<Tailscale IP>:3000` で開ける

もし開けない場合:

- Windows Defender Firewall が Node.js または Docker Desktop の通信を遮断していないか確認する
- `PowerShell` で Tailscale IP 宛の疎通ではなく、まず PC 上で `localhost:3000` が生きているか切り分ける

Tailscale 公式 FAQ では、多くの場合は追加の受信ポート開放は不要とされています。必要なら送信方向の `443` が通ることを確認します。

## 7. Docker App Startup Checks

本番用 PC で確認するコマンド:

```powershell
docker compose ps
docker compose logs --tail 50 backend
docker compose logs --tail 50 frontend
curl http://localhost:3000/api/health
curl http://localhost:3000
```

期待する状態:

- backend が `running`
- frontend が `running`
- `http://localhost:3000/api/health` が `200`
- `http://localhost:3000` で React の画面が返る

## 8. Operation After Reboot

再起動後の運用は次の 2 つです。

### Tailscale

- Windows 起動時に Tailscale が自動起動することを確認する
- Tailscale アイコンが接続済みになることを確認する

### Docker app

- Docker Desktop の自動起動を有効にする
- `docker-compose.yml` の `restart: unless-stopped` を維持する
- 必要に応じてログイン後に次を確認する

```powershell
docker compose ps
```

再起動後の簡易確認手順:

1. Tailscale が接続済み
2. `docker compose ps` で backend / frontend が起動済み
3. PC 上で `http://localhost:3000` が開く
4. スマホ上で `http://<Tailscale IP>:3000` が開く

## 9. Troubleshooting

### PC 側

```powershell
tailscale status
tailscale ip -4
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
curl http://localhost:3000/api/health
curl http://localhost:3000
```

### スマホから開けないとき

1. スマホの Tailscale が接続済みか確認する
2. PC とスマホが同じアカウントの tailnet にいるか確認する
3. PC の Tailscale IP が変わっていないか確認する
4. PC 上で `http://localhost:3000` が開くか確認する
5. `tailscale status` で PC がオンラインか確認する

### よくある原因

- スマホが Tailscale 未接続
- PC とスマホで別アカウントに入っている
- Docker アプリが起動していない
- Windows ファイアウォールで通信が止められている

## Development Vs Production

開発時:

- 画面は `http://localhost:5173`
- API は Vite proxy 経由で backend に届く
- 主に PC 上で作業する

本番運用時:

- PC 上では `http://localhost:3000`
- スマホからは `http://<Tailscale IP>:3000`
- 一般公開せず、自分の端末だけがアクセスする

## References

- Windows install: `https://tailscale.com/kb/1022/install-windows`
- Android install: `https://tailscale.com/docs/install/android`
- iOS install: `https://tailscale.com/docs/install/ios`
- Connect to devices: `https://tailscale.com/docs/how-to/connect-to-devices`
- Tailscale IP addresses: `https://tailscale.com/kb/1033/ip-and-dns-addresses`
- Firewall FAQ: `https://tailscale.com/docs/reference/faq/firewall-ports`
