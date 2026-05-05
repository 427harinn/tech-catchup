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
          placeholder="未入力ならURLをタイトルにします"
        />
      </label>

      <label>
        メモ 任意
        <textarea
          value={form.memo}
          onChange={(event) => onChange({ ...form, memo: event.target.value })}
          placeholder="補足メモや、URLだけでは分かりにくい背景があれば入力"
          rows={3}
        />
      </label>

      <button type="submit" disabled={saving}>
        <Plus size={18} />
        {saving ? '要約依頼中' : 'URL登録'}
      </button>
    </form>
  );
}

