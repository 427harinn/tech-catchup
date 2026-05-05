# Docker Notes

Phase 1では `docker compose up -d --build` でfrontendとbackendを起動します。

SQLiteはDBサーバーではなくファイルDBとして扱い、`backend/data/app.db` を `./backend/data:/app/data` で永続化します。

