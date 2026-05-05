# 要約候補のピックアップ

RSS は広めに取得し、要約する記事だけをスコアで選ぶための仕組みです。

## 枠

通常運用は `limit=10` を基本にします。

- `interest`: 7 件
- `important`: 2 件
- `exploration`: 1 件

`limit=5` に戻すときは次の配分です。

- `interest`: 3 件
- `important`: 1 件
- `exploration`: 1 件

件数が増えた場合はおおむね次の比率に寄せます。

- 興味枠: 70%
- 人気・重要枠: 20%
- 探索枠: 10%

## 使うデータ

- `articles`
- `summaries`
- `reactions`
- `interest_weights`
- `notion_queue`

特に次を強く見ます。

- `interested`
- `try_later`
- `try_later` かつ Notion 同期済み
- `not_interested`
- ゲーム開発系キーワード

## スコア

返却される候補には次のスコアが入ります。

- `interest_score`
- `popularity_score`
- `novelty_score`
- `source_score`
- `final_score`

### interest_score

- `interested` に近いタグやキーワードを加点
- `try_later` をより強く加点
- Notion 同期済み `try_later` をさらに加点
- `not_interested` に近いものを減点
- ゲーム開発系キーワードは固定で強めに加点

ゲーム開発系として強めに拾う例:

- `Unity`, `C#`, `GameObject`, `Animator`, `Addressables`, `WebGL`, `URP`, `Shader`
- `Unreal Engine`, `UE5`, `Blueprint`, `Niagara`
- `Blender`, `VRM`, `Live2D`, `rigging`, `animation`
- `game AI`, `NPC`, `behavior tree`, `pathfinding`
- `mobile game`, `gyroscope`, `controller`, `WebRTC`
- `character AI`, `avatar`, `local LLM`, `Ollama`
- `ゲーム開発`, `Unity開発`, `ゲーム制作`, `2Dゲーム`, `3Dゲーム`
- `キャラクター制御`, `アニメーション`, `シェーダー`, `入力処理`
- `スマホゲーム`, `アバター`, `ローカルAI`

### popularity_score

- `openai_blog`
- `github_blog`
- `cloudflare_blog`
- `qiita`

のような重要ソースを加点します。

### novelty_score

- 最近あまり拾っていない source や tag を少し加点します
- ただし完全に無関係な記事だけを選ばないよう、単独では使いません

### source_score

- source ごとの信頼度を加点します

## API

```text
GET /api/articles/pickup?limit=10
```

失敗扱いの記事も含めたい場合:

```text
GET /api/articles/pickup?limit=10&include_failed=true
```

返却例のイメージ:

```json
{
  "articles": [
    {
      "id": 123,
      "title": "Example",
      "pickup": {
        "slot": "interest",
        "reason": "interest_score=24.5 final_score=21.3",
        "scores": {
          "interest_score": 24.5,
          "popularity_score": 18,
          "novelty_score": 8,
          "source_score": 16,
          "final_score": 21.3
        }
      }
    }
  ]
}
```

## CLI

```powershell
docker compose exec backend npm run articles:pickup -- --limit 10
```

失敗扱いも含める場合:

```powershell
docker compose exec backend npm run articles:pickup -- --limit 10 --include-failed
```

## fetch-and-summarize との連携

既定では最大 10 件を処理します。

```powershell
.\scripts\fetch-and-summarize.ps1
```

スコアピックアップを使う場合:

```powershell
$env:PICKUP_MODE = "score"
.\scripts\fetch-and-summarize.ps1
```

5件に戻す場合:

```powershell
.\scripts\fetch-and-summarize.ps1 -Limit 5
```

`PICKUP_MODE=score` のときは `GET /api/articles/pickup` を使います。
API 失敗時は従来の未要約取得に自動でフォールバックします。
