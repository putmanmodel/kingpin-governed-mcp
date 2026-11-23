GO for a publication PR and a subsequent request for explicit npm publication approval, limited to the dedicated-consumer installation qualified here. Qualification was completed on the uncommitted candidate on `codex/npm-package-candidate`; the owner subsequently authorized committing that candidate, pushing only that branch and opening a PR. Merge and npm publication remain subject to separate owner approval. No MCP Registry change or runtime-package modification is included.

The [review evidence digest](REVIEW-EVIDENCE.md) makes retained test outcomes, all 27 control classifications, archive inventory and evidence hashes available in the PR. Raw logs, JSON reports, consumer installations and tarballs remain local under ignored `evidence/` or temporary directories; those paths below identify retained records, not files committed to this PR. All packaging documentation and qualification helpers are excluded from the npm archive.

Public `main` was verified as `d825ff7997c443003ec9d2880db2db195e648353` before work began. The open workspace belonged to a different repository with unrelated untracked qualification work, so the MCP repository was cloned into its own directory. Its `main` is unchanged. This report concerns only that isolated candidate.

1. Files and packaging approach

| File | Change |
| --- | --- |
| package.json | Removed private-only status; added bin mappings, custom-license/repository metadata, exact Node/npm engines, explicit 12-file allowlist and separate qualification commands. Declares all 15 existing dependency packages at their baseline versions. |
| server.mjs, demo.mjs | Added only a Node shebang and executable mode 0755. The existing code, including import.meta.main semantics, is unchanged. |
| package-lock.json → npm-shrinkwrap.json | Replaced the checkout lock with a distributable snapshot; all 15 baseline version, registry URL, integrity and license tuples preserved. Client dependencies are production dependencies. |
| README.md, NOTICE.md | Added local tarball instructions, dependency constraints/limitations and the alteration record. Existing GitHub-checkout instructions remain functional. No npm availability announcement. |
| packaging/checks.mjs, installed.test.mjs, negative-controls.mjs, inspect-artifact.mjs | Added separate source-only artifact qualification and focused mutation controls. |
| packaging/QUALIFICATION.md | This review report; excluded from the package. |

All governance modules, profiles, LICENSE, exact fixture, original tests and `.mcp.json` remain byte-identical. The installed bin names are `kingpin-mcp` and `kingpin-mcp-demo`; each executes its existing module directly, preserving Node entry-point behavior without a wrapper.

2. Exact artifact

`kingpin-governed-mcp@0.1.0`, file `evidence/kingpin-governed-mcp-0.1.0.tgz`, 17233 bytes compressed, 47,675 bytes unpacked.

```text
SHA-256: c61c196392d46dc566123515b2f1a5d70970233dc46faa9212fc66bceb8d56ae
SHA-1 (npm pack): 320075e5a9fd4f83c442fc50f6f06d08ff6dd314
npm integrity: sha512-y0pcsPmLQYbuV7kMC+YJ8zHDW8fUdYB74jpsSsOkBZ5PXuOOSteeR9PYFWnc+DdsfQnVEq4qZW5Ie+btsvs9Uw==
```

The archive contains exactly 12 regular files, with no bundled dependencies: `package.json`, `npm-shrinkwrap.json`, `README.md`, `LICENSE`, `NOTICE.md`, `server.mjs`, `demo.mjs`, `host.mjs`, `enforce.mjs`, `profiles.mjs`, `read-fixture.mjs`, and `fixtures/message.txt`. Every archive file was compared byte-for-byte against the source and consumer installation; each file hash and mode is recorded in `evidence/artifact-inspection.json`. The executables are 0755 and the other files 0644. Tests, editor config, qualification scripts, reports, caches and evidence are excluded.

3. Installed-artifact qualification

Environment: macOS 26.6.2, Darwin 25.6.0, arm64, Node v24.14.1, npm 11.11.0. Fresh consumer: `/private/tmp/kingpin qualified consumer with spaces wueyc7`, outside the source checkout. Installation used the local tarball with `--omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`; registry/cache access was available. No lifecycle script or development dependency was required.

**12/12 installed-artifact tests passed**, zero failures or skips. Evidence: `evidence/installed-tests.tap`.

| Verified behavior | Result |
| --- | --- |
| Installed server and demo commands | Both launch directly from unrelated directories, including spaces in the installation and working paths. A decoy cwd fixture is not read. |
| Normal profile | Exact 19 bytes `Kingpin fixture v1\n`; base64 `S2luZ3BpbiBmaXh0dXJlIHYxCg==`, final newline preserved; isError false. |
| Lease-required profile | Exact gate_2_requires_valid_lease refusal, isError true, no bytes or payload fields. |
| Tool inventory | Only read_governed_fixture; no extra tools or pagination cursor. |
| Protocol isolation | Server stdout contains only expected JSON-RPC responses. Correlated diagnostic JSON appears on stderr. |
| Entry semantics | Importing either entry module remains silent and does not start the CLI. Demo launches both profiles using installed SDK auto negotiation; raw server probes exercise the existing legacy wire protocol. |
| Restart and shutdown | EOF exits successfully; SIGTERM terminates the server; new processes start without replay and can change profiles. No claim of new signal-handling semantics. |
| Read-only installation | Entire installed node_modules tree made non-writable; opening the fixture for writing and creating a new file in the installed package were denied, while both profiles and demo succeeded. Permissions restored. |
| Installed dependencies | All 15 versions, registry URLs and integrity values match baseline; all 31 actual dependency edges resolve inside the consumer to the approved versions. |

4. Original regression qualification

**40/40 original tests passed unchanged**, zero failures or skips. Both baseline and candidate results are retained in `evidence/baseline-tests.tap` and `evidence/regression-tests.tap`. `acceptance.test.mjs` and `mcp.test.mjs` are byte-identical to the approved commit. `npm test` explicitly runs those two files so artifact tests remain a separate suite. Checkout `npm ci --include=dev --ignore-scripts`, `npm test` and `npm run demo` remain functional.

5. Independent negative controls

**27/27 targeted controls detected; 0 failed.** The untouched artifact and consumer must pass before mutation testing starts. Copies only are modified; each detection requires its expected error code and causal evidence, not an arbitrary nonzero exit or timeout. Details: `evidence/negative-controls.json`.

| Mutation family | Controls | Required evidence |
| --- | --- | --- |
| Omit each packaged file | 12 | Actually modified/re-extracted archives; FILES_MISSING names exactly the omitted file. |
| Import-only server/demo launch wrappers | 2 | Clean exit 0 with no response/results, specifically proving import.meta.main was bypassed. |
| Remove fixture final newline | 1 | File and successful MCP read both fail the independent literal-byte oracle. |
| Remove runtime, server, client or Zod | 4 | Exact dependency missing from inventory plus ERR_MODULE_NOT_FOUND naming that dependency. |
| Dependency integrity/version drift | 2 | Precise DEPENDENCY_TREE or DEPENDENCY_VERSION failure for the changed tuple or installed package. |
| Extra tool / stdout diagnostic | 2 | Exact extra tool inventory / protocol contamination while the normal tool result still succeeds. |
| Normal refuses / lease permits / refusal carries bytes | 3 | Specific counter-behavior succeeds first, then the matching behavioral assertion detects it. |
| Cwd-relative fixture lookup | 1 | Mutant works from package cwd but reaches adapter_error from unrelated cwd. |

An initial control-run safety guard rejected four disposable dependency-removal paths because macOS spelled a temporary root as `/var` versus `/private/var`. Those harness failures were never credited as detections; the temporary root was canonicalized and all 27 controls rerun successfully. Earlier evidence is retained under `evidence/exploratory/`.

6. Dependencies, shrinkwrap and licensing

The first four-dependency manifest installed jose 6.2.18 and pkce-challenge 5.0.2 instead of baseline 6.2.17 and 5.0.1. Merely packaging shrinkwrap did not constrain local-tarball installation in npm 11.11.0. The attempted internal `_hasShrinkwrap` marker was normalized away and was removed. The final supported fix pins the full existing dependency closure in the application manifest. No dependency was added to the qualified tree and no version changed. This is a deliberate application distribution constraint, not a claim that every package is imported directly by application code.

Shrinkwrap remains useful as the published dependency snapshot and the npm 11.11.0 checkout lock: unlike package-lock.json it is included in the package, and npm documents command-line applications as an appropriate use. It is not sufficient by itself for this local tarball installation. [npm 11 shrinkwrap documentation](https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json/).

It does not bundle or independently verify installed files, eliminate registry/cache requirements, apply updates, or guarantee compatibility. npm 12 removed shrinkwrap support at both the project root and inside dependency tarballs; this qualification does not extend the checkout workflow to npm 12. [npm 12 release notes](https://github.com/npm/cli/blob/latest/CHANGELOG.md#1200-2026-07-08).

| Installed package | Version | License metadata |
| --- | --- | --- |
| @modelcontextprotocol/client | 2.4.0 | Apache-2.0 |
| @modelcontextprotocol/core | 2.4.0 | Apache-2.0 |
| @modelcontextprotocol/server | 2.4.0 | Apache-2.0 |
| cross-spawn | 7.0.6 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.1.1 | MIT |
| isexe | 2.0.0 | ISC |
| jose | 6.2.17 | MIT |
| kingpin-runtime | 0.1.0-rc.4 | CC-BY-NC-4.0 |
| path-key | 3.1.1 | MIT |
| pkce-challenge | 5.0.1 | MIT |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| which | 2.0.2 | ISC |
| zod | 4.6.7 | MIT |

All installed registry URLs and SHA-512 integrity values are recorded individually in `evidence/artifact-inspection.json` and `evidence/consumer-package-lock.json`; actual dependency resolution paths are also recorded. npm integrity values refer to dependency archives, not an independent per-file integrity audit. Independent review additionally compared all 31 installed kingpin-runtime files with the locked source installation.

The integration keeps Kingpin Community License v0.1 and npm metadata `SEE LICENSE IN LICENSE`; LICENSE is unchanged, SHA-256 `a11f5389bd5cbdf9e5cd5d07d3db99075bdb543fdfd6c544ddf489d63d89a71e`. Runtime rc.4 retains CC BY-NC 4.0. The table reports SDK package metadata as Apache-2.0; the supplied SDK LICENSE also preserves MIT terms for contributions without relicensing consent and identifies CC-BY-4.0 documentation terms. Preserve the complete supplied license rather than treating its metadata as an exhaustive grant. Remaining dependencies retain MIT/ISC as shown. All installed dependency LICENSE files are present; runtime LICENSE and NOTICE.md are present. Their hashes are recorded. NOTICE preserves original integration credit and identifies packaging changes. No license grant was changed or generalized across components.

7. Installation and portability limits

Only a fresh, dedicated consumer on the stated macOS arm64 / Node / npm versions is qualified. Independent testing confirmed that an existing consumer with newer jose/pkce dependencies can cause a hoisted MCP client to resolve those newer versions even though the application itself resolves pinned copies. Adding dependencies, applying overrides or changing installer settings requires requalification. This is a known limitation, not merely an untested scenario.

Linux, Windows, other architectures, other Node/npm versions, other package managers, global installs, npx, registry publication and registry-based installation were not tested. Engine declarations are advisory unless npm is configured to enforce them. Registry access or a sufficiently populated cache is needed for installation; an initial offline attempt with only tarballs cached failed because metadata was absent. No new governance features, tools, filesystem scope, remote execution, authority administration or security claims were introduced.

8. Recommendation and reproduction

**GO** for opening a publication PR and subsequently requesting explicit npm publication approval for this narrowly documented candidate. The independent review found no material defect and recommended closing qualification without further testing. **NO-GO** for claims of general project installation, npm 12 checkout compatibility, cross-platform support or registry-install qualification based on this work. Publication account, package identity and distribution tag checks belong to the later publication workflow. Retained independent disposition and checks: `evidence/independent-review.json`; the subsequent owner-requested independent review is summarized in [REVIEW-EVIDENCE.md](REVIEW-EVIDENCE.md).

For PR preparation, public `main` was rechecked as `d825ff7997c443003ec9d2880db2db195e648353`. The source-only inspector now accepts a candidate commit descending from that baseline and records its commit identity; all byte comparisons still use the same approved baseline. This permits reproduction after committing the candidate. The source-only report also clarifies SDK license metadata and the write probes. No packaged file was changed by these PR-preparation updates.

Reproduce from the candidate checkout using a new consumer directory outside it (set absolute paths for the archive and consumer):

```sh
npm ci --include=dev --ignore-scripts --registry=https://registry.npmjs.org
npm test
npm run demo
npm pack --ignore-scripts --json --pack-destination /absolute/artifact-directory
# In the fresh consumer directory:
npm init -y
npm install --omit=dev --ignore-scripts --registry=https://registry.npmjs.org /absolute/artifact-directory/kingpin-governed-mcp-0.1.0.tgz
# Back in the candidate checkout:
KINGPIN_CONSUMER="/absolute/consumer directory" npm run test:installed
node packaging/inspect-artifact.mjs /absolute/artifact-directory/kingpin-governed-mcp-0.1.0.tgz "/absolute/consumer directory" evidence/artifact-inspection.json
npm run test:negative -- --consumer "/absolute/consumer directory" --tarball /absolute/artifact-directory/kingpin-governed-mcp-0.1.0.tgz --output evidence/negative-controls.json
```

Owner PR review is the next step. This report does not authorize merge or npm publication.
