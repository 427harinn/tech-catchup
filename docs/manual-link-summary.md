# 手動URL要約

## 概要

手動で URL を登録すると、`summarize_link` ジョブを作成して runner server 経由で要約します。  
成功したときだけ `articles` / `summaries` に保存され、通常一覧へ表示されます。

## 流れ

```text
URL登録
-> POST /api/jobs/summarize-link
-> backend が queued job を作成
-> backend が runner server に通知
-> runner server が run-summarize-link-job.ps1 を実行
-> Codex CLI が要約
-> 成功時のみ articles / summaries に保存
-> 一覧に summarized 記事として表示
```

## 基本方針

- `source = manual` で保存する
- 要約成功前は通常一覧に出さない
- 失敗時は記事を保存せず、job と log にだけ残す
- `needs_manual_text` のときは本文を貼って再実行する

## job payload

`POST /api/jobs/summarize-link`

```json
{
  "url": "https://example.com/article",
  "title": "任意タイトル",
  "memo": "任意メモ",
  "body_text": "URL本文を読めないときに貼る本文"
}
```

`body_text` は任意です。  
X / Twitter のように URL だけでは本文確認が不安定な場合は、この欄に本文を貼ると、その内容を優先して要約します。

## job status

- `queued`
- `running`
- `succeeded`
- `failed`
- `needs_manual_text`

`needs_manual_text` になる主なケース:

- Codex が URL 本文を十分に確認できなかった
- Codex 出力が prompt / workspace 寄りで、記事本文ベースと判定できなかった
- `body_text` もなく、URL本文も確認できなかった

## Codex の要約

`prompts/link_summary.md` と `scripts/link-summary.schema.json` を使います。

主な出力:

- `title_suggested`
- `summary_short`
- `tech_points`
- `relevance`
- `next_action`
- `tags`
- `priority`
- `source_type`
- `raw_excerpt`
- `needs_manual_text`

## 保存方針

成功時のみ backend API で保存します。

- `articles.url`: 手動登録URL
- `articles.source`: `manual`
- `articles.status`: `summarized`
- `articles.raw_excerpt`: Codex が返した短い抜粋、なければメモや本文の一部
- `summaries`: Codex の要約JSON

## X / Twitter リンク

`x.com` / `twitter.com` も `summarize_link` ジョブで扱います。

方針:

- アプリ側で X / Twitter をスクレイピングしない
- URL だけで読めるならそのまま要約する
- 読めない場合は `needs_manual_text` にする
- 投稿本文を `body_text` に貼れば、その本文ベースで要約できる

## ログ

- runner server: `logs/runner-server.log`
- summarize_link runner: `logs/run-summarize-link-job.log`
- Codex 出力: `logs/codex-link-last-message-job-<job_id>.json`
