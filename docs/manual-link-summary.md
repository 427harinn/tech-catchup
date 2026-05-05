# 手動URL要約

## 概要

手動で URL を登録したときは、その場で通常記事を作りません。

次の流れで `summarize_link` ジョブとして処理します。

```text
URL登録
↓
POST /api/jobs/summarize-link
↓
backend が queued ジョブを作成
↓
backend が runner server に通知
↓
runner server が run-summarize-link-job.ps1 を実行
↓
Codex CLI が URL を確認して要約
↓
成功時だけ articles / summaries に保存
↓
画面に summarized 記事として表示
```

## 基本方針

- `source = manual` で保存する
- 要約成功前は通常一覧に出さない
- 要約失敗時は記事自体を作らない
- 失敗理由は `jobs` と `logs` に残す
- `needs_manual_text` のときは本文貼り付け再実行の余地を残す

## job payload

`POST /api/jobs/summarize-link`

```json
{
  "url": "https://example.com/article",
  "title": "任意タイトル",
  "memo": "任意メモ"
}
```

## job status

- `queued`
- `running`
- `succeeded`
- `failed`
- `needs_manual_text`

`needs_manual_text` になる主なケース:

- Codex が URL 本文を十分に確認できなかった
- Codex の出力が URL 内容ではなく、prompt や workspace 要約に寄っていると判定した

## Codex の出力

`prompts/link_summary.md` と `scripts/link-summary.schema.json` を使います。

主な項目:

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

成功時だけ backend API で保存します。

- `articles.url`: 手動登録URL
- `articles.source`: `manual`
- `articles.status`: `summarized`
- `articles.raw_excerpt`: Codex が得た概要または入力メモ
- `summaries`: Codex の要約JSON

## X / Twitter リンク

`x.com` / `twitter.com` も同じ `summarize_link` ジョブに流します。

今回の方針:

- アプリ側で X / Twitter をスクレイピングしない
- Codex CLI に URL を渡して、確認できる範囲で読む
- 十分に読めなければ `needs_manual_text` にする
- 将来は、その状態から本文貼り付けで再実行できるようにする

## ログ

- runner server: `logs/runner-server.log`
- summarize_link runner: `logs/run-summarize-link-job.log`
- Codex 出力: `logs/codex-link-last-message-job-<job_id>.json`
