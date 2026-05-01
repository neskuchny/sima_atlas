# External Atlas API (local)

Run:

```bash
node scripts/atlas_api_server.mjs
```

Health:
- `GET /health`

Commands from UI/automation:
- `POST /finalize` `{ "block_id": "b.docs", "transcript_path": "tests/fixtures/chat_transcript_sample.jsonl" }`
- `POST /run-process` `{ "block_id": "b.core-sync", "process": "sync_audit_context" }`
- `POST /generate-docs` `{}`
- `POST /ingest-chat-batches` `{ "transcript_path": "tests/fixtures/chat_transcript_sample.jsonl", "block_id":"b.docs", "batch_size": 6 }`
- `POST /auto-sync` `{ "block_id":"b.docs", "notes":"что изменилось в продукте" }`

This API does **not** require extra LLM keys. It orchestrates existing local scripts and MCP/Atlas pipelines.
