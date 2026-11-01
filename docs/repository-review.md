# Repository documentation and credential review

Initial review: 31 October 2026. Publication follow-up: 1 November 2026. Scope: the current project files, documentation, tracked images, ignore rules, and locally available Git history. This is a repository hygiene review, not an independent smart-contract security audit.

## Findings and corrections

- The GitHub screenshot is a commit diff: red shows removed text and green shows its replacement. The displayed RPC explanation contains no credential value.
- The initial scan covered 192 tracked files and 241 locally available Git blob objects. It found neither the actual Alchemy credential nor the checked literal patterns for Alchemy keys, GitHub tokens, private-key assignments, and private-key PEM blocks.
- Expanded credential-pattern checks identified the standard public Anvil test mnemonic in the vendored `forge-std` tests. Its derived test key is a public fixture, not a project wallet credential, and is not a production frontend asset. The upstream fixture is preserved. No additional credential candidates remained after that classification.
- Before edits, the local source tree matched GitHub `main` exactly: tree `60c016cce92bbc9244526b462096ac04425f4c1d`, main revision `5e8516738c2b9e7ccc37f3d6eeaae13dc95f4d84`.
- The only tracked image asset was `public/coindeccflow.svg`, the application logo. Generated release screenshots and Dora before/after backups are local artifacts under the ignored `.e2e/` directory.
- The tracked environment files are `.env.example` and `.env.mainnet.example`. They contain public configuration and empty secret placeholders. The real `.env.local` remains ignored, with owner-only file permissions.
- README and release/evidence documents contained outdated pre-release statements, including missing live links, a deferred Dora update, and claims that deployment or the wallet demonstration had not happened. They now distinguish the completed Mainnet release from outstanding assurance and submission items.
- The RPC description now accurately distinguishes Alchemy state reads from bounded public Arc event-history reads. WalletConnect/Reown requirements are stated separately from the demonstrated MetaMask connection.
- Ignore rules now also cover local Vercel metadata, secret directories, keystores, and common private-key container extensions.

The earlier release scan separately checked 89 public browser assets and found no real Alchemy key. The repository scan and public-asset scan cover different surfaces.

## Validation

Relative documentation links, whitespace checks, private-file ignore checks, public-template tracking, and absence of the known key from changed files passed. These corrections change documentation and ignore rules; application source, contracts, dependencies, and runtime configuration are unchanged.

The scan does not establish the absence of every possible unknown or obfuscated credential, unreachable Git objects, files outside this repository, or data outside the enumerated repository refs. Ignoring a file also does not remove an already committed file. A credential that was actually disclosed must be rotated rather than merely deleted from the latest revision.

## Publication follow-up — 1 November 2026

GitHub showed three branches and no tags before publication. Its 13 reachable commits contained 11 distinct source snapshots; every snapshot matched a tree available in the local review. The 193 current remote files also matched the reviewed local files exactly. This closes the earlier gap between local-history checks and the enumerated remote branch history.

The renewed scan covered 193 tracked files and 253 local historical blob objects, plus commit messages. It found no project credential candidates after classifying the standard public Anvil fixture. Documentation links and private-file exclusion checks passed. These are targeted hygiene checks, not proof that every unknown or obfuscated secret is absent.

The owner authorized publication after review. GitHub confirmed `visibility: public` and `private: false` for [coindeccflow/coindeccflow](https://github.com/coindeccflow/coindeccflow). The repository summary now describes the implemented Mainnet milestone-payment flow.

## Remaining submission status

The source is publicly accessible for judge review. The Arc Studio project URL, walkthrough video, and final hackathon entry confirmation remain independently unverified. A published Dora project is separate from a confirmed entry into a particular hackathon.

“Hackathon prototype” describes a functional implementation whose independent security audit and explorer source verification are outstanding. It is not a statement that the app lacks a working Mainnet implementation. Eligibility and award selection are determined by the organizer’s rules and review.
