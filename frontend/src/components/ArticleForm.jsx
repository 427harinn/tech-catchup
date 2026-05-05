import { Plus } from 'lucide-react';

export function ArticleForm({ form, saving, onChange, onSubmit }) {
  return (
    <form className="article-form" onSubmit={onSubmit}>
      <label>
        URL
        <input
          type="url"
          value={form.url}
          onChange={(event) => onChange({ ...form, url: event.target.value })}
          placeholder="https://example.com/article"
          required
        />
      </label>

      <label>
        タイトル 任意
        <input
          type="text"
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          placeholder="未入力ならURL先や要約結果から補います"
        />
      </label>

      <label>
        メモ 任意
        <textarea
          value={form.memo}
          onChange={(event) => onChange({ ...form, memo: event.target.value })}
          placeholder="補足メモ。URLだけでは分かりにくい背景があれば入力"
          rows={3}
        />
      </label>

      <label>
        本文 任意
        <textarea
          value={form.body_text}
          onChange={(event) => onChange({ ...form, body_text: event.target.value })}
          placeholder="X / Twitter などURL本文を読みづらいときは、ここに本文を貼り付けて要約できます"
          rows={8}
        />
      </label>

      <button type="submit" disabled={saving}>
        <Plus size={18} />
        {saving ? '要約依頼中' : 'URL登録'}
      </button>
    </form>
  );
}
