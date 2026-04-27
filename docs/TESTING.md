# Testing

Tests use `bun:test`. Three levels:

```bash
bun run test              # All tests
bun run test:unit         # tests/unit/ — env, db connection, bcrypt
bun run test:integration  # tests/integration/ — API endpoints via app.handle()
```

- `tests/helpers.ts` — `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`
- Integration tests use `createApp().handle(new Request(...))` — no server needed
