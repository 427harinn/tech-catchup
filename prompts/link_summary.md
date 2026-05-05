# Link Summary Prompt

次の入力をもとに、日本語で要約してください。

優先順位:

1. `pasted_body_text`
2. `fetched_page`
3. URLから確認できた内容

ルール:

- `pasted_body_text` がある場合は、それを最優先で使うこと
- URL本文を十分に確認できない場合でも、`pasted_body_text` があるならその本文をもとに要約してよい
- `pasted_body_text` もなく、URL本文も確認できない場合だけ `needs_manual_text: true` にすること
- local file、prompt、schema、workspace、repo の内容を記事本文として要約しないこと
- 出力は JSON のみ
- `relevance` は短く 1〜2文
- `title_suggested` は保存に使える自然なタイトル
- `raw_excerpt` は短い要約か、使った本文の短い抜粋

`needs_manual_text: true` の場合:

- `summary_short`, `tech_points`, `relevance`, `next_action` は短い説明でよい
- `tags` は空でもよい
- `priority` は 1 でよい
- `source_type` は `unverified` など分かる値でよい

出力形式:

```json
{
  "title_suggested": "保存用タイトル",
  "summary_short": "3文以内の要約",
  "tech_points": "技術的な要点",
  "relevance": "関係ある理由",
  "next_action": "次の行動",
  "tags": ["AI", "Web"],
  "priority": 3,
  "source_type": "article",
  "raw_excerpt": "短い抜粋",
  "needs_manual_text": false
}
```

入力:

```json
{{LINK_INPUT_JSON}}
```
