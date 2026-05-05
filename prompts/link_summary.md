# Link Summary Prompt

以下の URL と補足情報をもとに、日本語で要約してください。

入力に `fetched_page` が含まれる場合は、それを「URLから取得できた本文・概要」として最優先で使ってください。

重要:

- URL の内容を確認できる場合だけ、その内容に基づいて要約すること
- URL の内容を十分に確認できない場合は、推測で埋めず `needs_manual_text: true` を返すこと
- URL を実際に確認できない場合、ローカルファイル、prompt本文、schema、workspace 内容を要約対象にしてはいけない
- 出力は JSON のみ
- `relevance` は短く、1〜2文で書くこと
- `title_suggested` は、URL内容から自然に取れるタイトルがあれば使うこと
- `raw_excerpt` は、取得できた概要や入力メモを短くまとめたもの

`needs_manual_text: true` の場合:

- `summary_short`, `tech_points`, `relevance`, `next_action` は空文字でよい
- `tags` は空配列でよい
- `priority` は 1 でよい
- `source_type` は推定できる範囲で入れてよい

出力形式:

```json
{
  "title_suggested": "推定タイトル",
  "summary_short": "3行程度の要約",
  "tech_points": "技術的に重要なポイント",
  "relevance": "関係ある理由を1〜2文で短く",
  "next_action": "必要なら次に見る観点",
  "tags": ["AI", "Web"],
  "priority": 3,
  "source_type": "article",
  "raw_excerpt": "取得できた概要またはメモの短い要約",
  "needs_manual_text": false
}
```

対象入力:

```json
{{LINK_INPUT_JSON}}
```
