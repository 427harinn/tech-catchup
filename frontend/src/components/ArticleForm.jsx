import { Link2, LoaderCircle, Sparkles } from 'lucide-react';

export function ArticleForm({ form, saving, onChange, onSubmit, latestLinkJob }) {
  const isBusy = latestLinkJob && ['queued', 'running'].includes(latestLinkJob.status);

  return (
    <section className="panel panel--soft">
      <div className="panel__header">
        <div>
          <p className="eyebrow">手動登録</p>
          <h2>URLをすぐ要約する</h2>
        </div>
        <div className={`job-pill ${isBusy ? 'job-pill--running' : 'job-pill--idle'}`}>
          {isBusy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
          {isBusy ? '要約中' : '待機中'}
        </div>
      </div>

      <form className="article-form" onSubmit={onSubmit}>
        <label className="field">
          <span>URL</span>
          <div className="field__input">
            <Link2 size={16} />
            <input
              type="url"
              value={form.url}
              onChange={(event) => onChange({ ...form, url: event.target.value })}
              placeholder="https://example.com/article"
              required
            />
          </div>
        </label>

        <div className="article-form__grid">
          <label className="field">
            <span>任意タイトル</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="未入力ならURL先や要約結果から補います"
            />
          </label>

          <label className="field">
            <span>任意メモ</span>
            <textarea
              value={form.memo}
              onChange={(event) => onChange({ ...form, memo: event.target.value })}
              placeholder="見たい観点や補足があれば入れます"
              rows={3}
            />
          </label>
        </div>

        <label className="field">
          <span>本文貼り付け 任意</span>
          <textarea
            value={form.body_text}
            onChange={(event) => onChange({ ...form, body_text: event.target.value })}
            placeholder="X / Twitter などURLだけで本文を拾いにくいときは、ここに本文を貼るとその内容をもとに要約できます"
            rows={6}
          />
        </label>

        <div className="article-form__footer">
          <p>登録直後は一覧には出ず、要約成功後に表示されます。</p>
          <button type="submit" disabled={saving || isBusy}>
            {saving ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
            {saving ? '登録中' : '登録して要約'}
          </button>
        </div>
      </form>
    </section>
  );
}
