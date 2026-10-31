# Testing CoindeccFlowEscrow

Tests run locally with Foundry against a mock 6-decimal USDC. No network or funds needed.

```bash
bun run contracts:test                      # all tests
forge test --match-contract CoindeccFlowEscrowTest -vv
forge test --match-test testFuzz -vv        # fuzz tests
forge test --match-contract Invariant -vv   # invariants
```

Files:

- `contracts/test/CoindeccFlowEscrow.t.sol`: unit and fuzz tests.
- `contracts/test/CoindeccFlowEscrow.Invariant.t.sol`: accounting invariants.
- `contracts/test/CoindeccFlowEscrow.Adversarial.t.sol`: adversarial and invariant tests (value rejection, attacker cannot gain USDC, blocklisted recipient, donations, cancel and state-machine rules, overflow).
- `contracts/test/mocks/MockUSDC.sol`, `contracts/test/mocks/AdversarialMocks.sol`: mock USDC, fee-on-transfer, re-entering and blocklisting tokens, and the attacker handler.

Covered: agreement creation, invalid recipients, invalid milestone data, funding, unauthorized funding and approval, release rules (unfunded, unapproved, duplicate, third party), accounting, independent agreements, reentrancy, fee-on-transfer rejection, cancellation, completion, and the 0.20 USDC two-milestone demo.

Last run: 66 passed, 0 failed (40 original plus 26 adversarial).

Run them on Arc's own runtime too, which Arc recommends because a standard EVM cannot reproduce every Arc behavior. Install Arc Foundry (<https://docs.arc.io/arc/tutorials/install-arc-foundry.md>), then:

```bash
arc-forge test --network arc
```

Live end-to-end rehearsal on Arc Testnet with real transactions (uses throwaway wallets in `.e2e/`, never mainnet):

```bash
bun run e2e:testnet init   # prints the payer address; fund it with test USDC
bun run e2e:testnet run    # writes docs/e2e-testnet-run.json
```
