# Package candidate review evidence

This source-only digest presents essential retained qualification results for review. It does not record a new test run. The original machine outputs, candidate archive and consumer installation remain local; generated artifacts are intentionally excluded from Git and from the npm archive. SHA-256 references below identify those retained records. They identify evidence bytes, not an external attestation.

See [QUALIFICATION.md](QUALIFICATION.md) for methodology, reproduction commands, licensing and environment limitations. The source of the assertions is [checks.mjs](checks.mjs); the suites are [installed.test.mjs](installed.test.mjs) and [negative-controls.mjs](negative-controls.mjs). The original [acceptance.test.mjs](../acceptance.test.mjs) and [mcp.test.mjs](../mcp.test.mjs) remain unchanged.

## Qualified identity and scope

- Candidate: `kingpin-governed-mcp@0.1.0`.
- Approved source baseline: `d825ff7997c443003ec9d2880db2db195e648353`.
- Environment: macOS 26.6.2, Darwin 25.6.0, arm64, Node 24.14.1, npm 11.11.0.
- Installation: a fresh, dedicated consumer outside the checkout, with spaces in its path; local tarball installation with `--omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`.
- Archive: 17,233 bytes compressed; 47,675 bytes unpacked; 12 regular files; no bundled dependencies.
- SHA-256: `c61c196392d46dc566123515b2f1a5d70970233dc46faa9212fc66bceb8d56ae`.
- SHA-1: `320075e5a9fd4f83c442fc50f6f06d08ff6dd314`.
- npm integrity: `sha512-y0pcsPmLQYbuV7kMC+YJ8zHDW8fUdYB74jpsSsOkBZ5PXuOOSteeR9PYFWnc+DdsfQnVEq4qZW5Ie+btsvs9Uw==`.
- Fixture: exactly 19 bytes, `Kingpin fixture v1` followed by LF; base64 `S2luZ3BpbiBmaXh0dXJlIHYxCg==`.

The owner-requested independent review concluded **GO for a publication PR and a subsequent request for explicit npm publication approval**, with no material defect or demonstrated false PASS. It independently checked archive/source/consumer equality, all 15 dependency tuples, all 31 dependency-resolution edges, license/notice hashes and all 31 runtime files. It reviewed retained 40/40, 12/12 and 27/27 results without rerunning mutating suites. It recommended closing qualification without further testing. Its nonblocking SDK license-summary clarification is incorporated in QUALIFICATION.md. This conclusion does not approve merge or publication.

## Retained suite results

| Suite | Tests/controls | Passed/detected | Failed | Skipped/cancelled |
| --- | ---: | ---: | ---: | --- |
| Original baseline | 40 | 40 | 0 | 0 / 0 |
| Candidate original regression | 40 | 40 | 0 | 0 / 0 |
| Installed artifact | 12 | 12 | 0 | 0 / 0 |
| Negative controls | 27 | 27 | 0 | Not applicable; all controls ran |

The following extracts preserve all test names and result totals; durations and reporter formatting are omitted. The hashes below identify the complete original outputs.

### Original regression: 40 passing tests

```text
✔ A01
✔ A02
✔ A03
✔ A04
✔ A05
✔ A06
✔ A07
✔ A08a
✔ A08b
✔ A09
✔ A10
✔ A11 absent
✔ A11 unknown outcome
✔ A11 wrong evaluation
✔ A11 wrong context
✔ A11 schema
✔ A11 issuer
✔ A11 speaker
✔ A11 channel
✔ A11 scope
✔ A11 missing primary code
✔ A11 allow with lease refusal
✔ A11 deny with allow reason
✔ A11 unknown reason
✔ A12 --path=fixtures/message.txt
✔ A12 --identity=reader
✔ A12 --policy=default
✔ A12 --signal=PASS
✔ observer retains entry before correlation exists
✔ observer retains entry when the audit query throws
✔ A06 corrected signal can use the same evaluation ID
✔ default CLI reads challenge bytes and rejects missing and symlink fixtures
✔ documented RC.4 primary pairs accept additional reason codes
✔ auto negotiation and native outcomes
✔ legacy negotiation and native outcomes
✔ caller arguments and metadata cannot grant authority
✔ binary challenge, size boundary and failure after native allow
✔ cancellation before dispatch and after synchronous entry
✔ stdio launcher from workspace root, EOF and restart without replay
✔ legacy wire cancellation in same stdin write stops before adapter
ℹ tests 40
ℹ suites 0
ℹ pass 40
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Installed artifact: 12 passing tests

```text
ok 1 - installed package has exactly the 12 intended files and literal fixture bytes
ok 2 - production-only installed dependency versions and integrities match the shipped shrinkwrap
ok 3 - installed server normal from unrelated cwd
ok 4 - installed server lease-required from unrelated cwd
ok 5 - installed demo from unrelated cwd
ok 6 - installed server normal from unrelated cwd with spaces
ok 7 - installed server lease-required from unrelated cwd with spaces
ok 8 - installed demo from unrelated cwd with spaces
ok 9 - entry modules imported by Node do not auto-start or print results
ok 10 - EOF restart has no replay; a new process accepts a fresh profile and fresh request
ok 11 - installed server exits on SIGTERM and can start again
ok 12 - server and demo run with the complete installed dependency tree effectively read-only
1..12
# tests 12
# suites 0
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### Negative controls: 27 detected, zero failures

The untouched archive and installation passed baseline checks before mutation. Each row below was executed against a disposable archive or consumer copy. A matching error code alone was insufficient where the control requires causal behavior or an exact missing dependency. See the linked source for those assertions.

| Control | Expected detection / causal check | Result |
| --- | --- | --- |
| archive omits LICENSE | FILES_MISSING | Detected |
| archive omits NOTICE.md | FILES_MISSING | Detected |
| archive omits README.md | FILES_MISSING | Detected |
| archive omits demo.mjs | FILES_MISSING | Detected |
| archive omits enforce.mjs | FILES_MISSING | Detected |
| archive omits fixtures/message.txt | FILES_MISSING | Detected |
| archive omits host.mjs | FILES_MISSING | Detected |
| archive omits npm-shrinkwrap.json | FILES_MISSING | Detected |
| archive omits package.json | FILES_MISSING | Detected |
| archive omits profiles.mjs | FILES_MISSING | Detected |
| archive omits read-fixture.mjs | FILES_MISSING | Detected |
| archive omits server.mjs | FILES_MISSING | Detected |
| server bin imports entry instead of executing it | SERVER_STARTUP with clean exit and no response | Detected |
| demo bin imports entry instead of executing it | DEMO_STARTUP with clean exit and no results | Detected |
| fixture loses its final newline | FIXTURE_BYTES on file and successful MCP read | Detected |
| missing installed dependency kingpin-runtime | DEPENDENCY_MISSING and exact module-loading error | Detected |
| missing installed dependency @modelcontextprotocol/server | DEPENDENCY_MISSING and exact module-loading error | Detected |
| missing installed dependency zod | DEPENDENCY_MISSING and exact module-loading error | Detected |
| missing installed dependency @modelcontextprotocol/client | DEPENDENCY_MISSING and exact module-loading error | Detected |
| transitive dependency integrity differs from qualified tree | DEPENDENCY_TREE for the exact changed integrity tuple | Detected |
| installed transitive dependency has the wrong version | DEPENDENCY_VERSION for the exact changed package version | Detected |
| server accidentally exposes a second MCP tool | TOOL_COUNT with exactly the injected additional tool | Detected |
| server diagnostics accidentally contaminate protocol stdout | STDOUT_PROTOCOL while the normal read still succeeds | Detected |
| normal profile accidentally refuses | NORMAL_BEHAVIOR for exact lease-required refusal | Detected |
| lease-required profile accidentally permits | REFUSED_BEHAVIOR for exact fixture read | Detected |
| refusal accidentally includes payload bytes | REFUSED_BEHAVIOR while refusal reason is unchanged | Detected |
| fixture lookup depends on checkout working directory | NORMAL_BEHAVIOR only outside package working directory | Detected |

An earlier run recorded 23 detections and four failures because a temporary-directory containment guard encountered macOS `/var` versus `/private/var` spelling. Those failures were not counted as detections. After canonicalizing the temporary root, the retained final run executed all 27 controls successfully.

## Archive inventory

Each listed file matched the source checkout and installed consumer byte-for-byte. The two bin links resolve directly to their respective entry modules. Tests, qualification helpers, editor configuration, evidence and dependencies are absent from the archive.

| File | Bytes | Mode | SHA-256 |
| --- | ---: | --- | --- |
| `LICENSE` | 8300 | `644` | `a11f5389bd5cbdf9e5cd5d07d3db99075bdb543fdfd6c544ddf489d63d89a71e` |
| `NOTICE.md` | 2614 | `644` | `e9794cb145da5008ebe2824126b2c8fb0572de9151e946292415921f63812ba0` |
| `README.md` | 16263 | `644` | `53de6d1a47df04c40e3b94bf8260975f1954978f5276f51a8a35097eeea57843` |
| `demo.mjs` | 1895 | `755` | `055ae765a9db9381b7a14a8e530914cfb8acfd81cdfddaefdf2e4a906cd91883` |
| `enforce.mjs` | 1733 | `644` | `581b1e60d919467b91d2bc137c06c1e49b0a81dcb46dde653f10c26fee6a3005` |
| `fixtures/message.txt` | 19 | `644` | `49e1422c69a3648c49dcdfafda241caafa9c51e676c64d8bdba067078cad5901` |
| `host.mjs` | 3920 | `644` | `9be69779198e8aa8de329a86b6fce8a92427261e1ceaecaccd4146deb0bb2552` |
| `npm-shrinkwrap.json` | 7061 | `644` | `2f7cc950de1a95e9bb2a21f1cf15318b2b325c16e38b135527f515df97b0caae` |
| `package.json` | 1433 | `644` | `cfaa6dcb761fb897a83de1a2db0ef8285580edddca02e58964656b64ecc3650a` |
| `profiles.mjs` | 541 | `644` | `c8ab32d055df4be9e94d59184193e773ced60412dfe86f7797b9d997500c282e` |
| `read-fixture.mjs` | 1516 | `644` | `e8a880b29f7070b4d5ad2a703588765bdc795dc46860d14140313a8b7f5b9a9d` |
| `server.mjs` | 2380 | `755` | `5859401eac803fa234f456b0869988ba86e0420bd1b644fefceb260a141bf600` |

## Dependency and behavior evidence

All 15 dependency versions, registry URLs, integrity values and license metadata match the approved baseline lock. The distributed [npm-shrinkwrap.json](../npm-shrinkwrap.json) exposes those exact records to reviewers. The retained consumer lock matches the candidate archive's SHA-512 integrity. All 31 dependency-resolution edges stayed inside the dedicated consumer and resolved to the qualified versions. All installed dependency license files and the runtime notice were present; their hashes are retained in artifact-inspection.json. All 31 runtime files matched the locked source installation.

The initial four-dependency archive included shrinkwrap but its consumer selected jose 6.2.18 and pkce-challenge 5.0.2 instead of the locked 6.2.17 and 5.0.1. The final manifest directly pins the existing 15-package closure. A separate mixed-consumer experiment demonstrated that a hoisted MCP client can still resolve a consumer's newer transitive version. This qualification therefore requires a fresh, dedicated consumer. It does not establish support for a mixed dependency graph or consumer overrides.

The unchanged original tests and governance modules, together with the installed literal-byte and exact-refusal assertions, preserve the permitted `normal` read and the `lease-required` refusal without payload. No new authority, tools, filesystem scope or security guarantees are claimed. Runtime-file equality and archive integrity are not an independent per-file audit of all third-party code.

## Retained record references

These paths are relative to the candidate checkout and intentionally ignored by Git. The digest above exposes essential outcomes without committing raw JSON, logs, temporary paths or duplicate archives. The owner retains the complete records for inspection. The subsequent independent review is recorded in the owner review conversation; independent-review.json is the earlier retained qualification review, not that later conversation.

| Local record | Bytes | SHA-256 |
| --- | ---: | --- |
| `evidence/kingpin-governed-mcp-0.1.0.tgz` | 17233 | `c61c196392d46dc566123515b2f1a5d70970233dc46faa9212fc66bceb8d56ae` |
| `evidence/baseline-tests.tap` | 1890 | `0e2ee4ebc4dbae2fad0e7d381c2b78be0b6c8c62c11e0a65081bfd0b45635397` |
| `evidence/regression-tests.tap` | 1920 | `fc54149b6a41ed39c728c1d3966975f132a5a34d997fc6201cf192ee187f64d3` |
| `evidence/installed-tests.tap` | 2562 | `a7b71bacb3ef40403dee9899da9956fe2bbfa2c2ecd27a2e7de42661153409f0` |
| `evidence/negative-controls.json` | 37512 | `98b6944acab512b4c26001c82ab2fffb81f4cc1f6d888bbce0e0da61fa4a6df6` |
| `evidence/artifact-inspection.json` | 21017 | `7f769dbd2c4b2688cca2f20b3354a0a386a7386193ae093815ae55c80c91020f` |
| `evidence/consumer-package-lock.json` | 7672 | `58986ae19d248940eed5a39982b6a5a3747a5305fb49298dd235dfdebe9f3c34` |
| `evidence/installed-npm-ls.json` | 4725 | `bb435ea9c0e5fcbc767263a68a48eeb0a9825ecf25df3b4a5e94abf0bce56b24` |
| `evidence/independent-review.json` | 30878 | `72537dc4e485a7f8b584f3681e0c40abf0cbddb09d67acdc5cf4b9fb5c2342b3` |
| `evidence/pack.json` | 1530 | `790a682608d64fa7deba7c95fbacf9790976f3c2d1c0c9de6f618b3977602708` |
| `evidence/final-repack.json` | 139 | `30db434d910b598ee8ce0f1fe3646feaa6da3c24ccae724e81bf86c92434fa1b` |

## Publication boundary

Linux, Windows, other architectures, other Node/npm versions, other package managers, global installation, npx, registry publication and registry installation remain unqualified. npm 12's removal of shrinkwrap support is documented upstream. Engine declarations are advisory unless enforced by the installer. Installation needs registry access or a sufficiently populated cache.

The integration remains source-available and noncommercial under Kingpin Community License v0.1; runtime rc.4 retains CC BY-NC 4.0. Other components retain their supplied terms. The manifest's SDK license identifiers do not replace the full SDK licensing-transition notices.

A PR approval is separate from npm publication approval. Any later publication request must identify the reviewed archive hash, package/version, registry and intended distribution tag. Neither this digest nor the qualification results authorizes publication or merge.
