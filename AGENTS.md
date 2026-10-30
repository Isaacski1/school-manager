# AGENTS.md

## Commands

| Command | Description |
|---------|-------------|
| `npm run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm test` | Run all test suites (`node --test ...`) |
| `npm run test:ledger` | Run ledger-fee-assignment + obligation-reassignment tests only |
| `npm run test:parent-fees` | Run parent-fees + parent-fee-data tests |
| `npm run test:term-rollover` | Run term-rollover tests |
| `npm run test:payment-verification` | Run payment-verification tests |
| `npm run test:security-login` | Run security-login-log tests |

Node test files use `node --test` with ES module imports (`.js` files in `server/`).
