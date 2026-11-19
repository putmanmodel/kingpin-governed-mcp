# Kingpin governed fixture reader

Kingpin is a source-available, noncommercial Node.js MCP developer preview. Reproduce two behaviors with `read_governed_fixture` and `{}`: a permitted read of `fixtures/message.txt` under `normal`, and an explicit refusal without bytes under `lease-required`. The host owns the path and evaluates each call before entering the reader; tool arguments cannot supply a path, identity, profile or lease.

## Run locally

Use Node **24.14.1** and npm **11.11.0**, with Git available. The reference environment is macOS on Apple silicon. Other operating systems, architectures, Node/npm versions and remote transports are unverified. The command-line demo needs no Copilot account. Review [Rights and feedback](#rights-and-feedback) before evaluating.

Clone the public repository into a new directory, then record the exact revision and tool versions for your report:

```sh
git clone https://github.com/putmanmodel/kingpin-governed-mcp.git
cd kingpin-governed-mcp
git rev-parse HEAD
node --version
npm --version
```

Keep the full commit SHA printed by `git rev-parse HEAD`; `0.1.0` alone does not identify the tested checkout. If reproducing someone else's report, run `git checkout --detach <reported-commit-sha>` with their full SHA before installation, then record `git rev-parse HEAD` again. Keep baseline source and dependency files unchanged and report any deviations.

Check that the versions match the qualified environment above. From this repository root, install locked dependencies (including the SDK client used by tests and demo), then run:

```sh
npm ci --include=dev --registry=https://registry.npmjs.org --ignore-scripts
npm test
npm run demo
```

The demo uses the SDK client to start two local stdio servers, asserts that each lists exactly one tool, and calls it. Expect 40 passing tests and two JSON results with different request IDs.

| Status | What happened |
| --- | --- |
| read | Enforcement permitted dispatch and the reader returned Base64. The expected value S2luZ3BpbiBmaXh0dXJlIHYxCg== decodes to “Kingpin fixture v1” followed by a newline. |
| refused | The authority denied the call. The lease-required example returns gate_2_requires_valid_lease and omits bytes. |
| adapter_error | Dispatch was allowed but the adapter failed, for example because the fixture was missing. |
| host_error | The host failed to complete authentication, authority evaluation or enforcement. |

The expected `lease-required` refusal sets MCP `isError: true`; that is a successful reproduction of authorization refusal, even if an editor labels the tool call failed. Confirm `status: refused`, `reason: gate_2_requires_valid_lease` and **no `bytes` field**. The `normal` profile must return `status: read`, the expected bytes and `isError: false`.

Both `npm test` and `npm run demo` should exit successfully. An installation error, failing test, nonzero demo exit, missing tool result, `adapter_error` or `host_error` is a setup or execution failure, not the expected refusal. The last two statuses also set MCP `isError`. Inspect the structured result and its request ID; server diagnostics go to stderr. A transport or protocol failure can occur before any tool result exists.

[Report a successful, partial or failed reproduction](https://github.com/putmanmodel/kingpin-governed-mcp/issues/new?template=independent-reproduction.md).

## Optional AI-assisted quick start

Open the repository in your coding assistant and paste this prompt:

```text
Read README.md and package.json. Guide me through the documented installation and
configuration using the locked dependencies. Leave the implementation, dependency
files, versions and license terms unchanged. Ask me before editing configuration
or granting workspace or server trust.

Help me run the tests and demo. Check that read_governed_fixture with {} returns
fixture bytes under normal and refuses without bytes under lease-required.
Report what you actually observed, including failures and any steps left unverified.
```

## Connect VS Code and Copilot

The CLI baseline above is the first evaluation path. Prior VS Code/Copilot verification was on macOS; other client versions and harness configurations are unverified until reproduced. Cursor, Claude Code and Claude Desktop have not been verified for this preview.

Current [VS Code integration documentation](https://code.visualstudio.com/api/extension-guides/ai/mcp#native-configuration) distinguishes these configuration paths (checked November 19, 2026):

- **Native Copilot:** workspace `.mcp.json`, using `mcpServers`, or user `$COPILOT_HOME/mcp-config.json` (`~/.copilot/mcp-config.json` by default). The supplied root `.mcp.json` selects `normal` and launches `node ./server.mjs`; open this repository as the workspace so the relative path resolves.
- **Deprecated Local harness:** `.vscode/mcp.json`, using `servers`, or an editor user-profile `mcp.json`. These are not native Copilot configuration files. Editor forwarding is conditional; do not treat this as an interchangeable fallback. See the [Local compatibility guidance](https://code.visualstudio.com/api/extension-guides/ai/mcp#local-harness-compatibility-deprecated).

1. Install dependencies as above. Enable Copilot Chat, sign in, and open the repository itself with File → Open Folder. Inspect the launcher and server before granting workspace or server trust.
2. For native Copilot, open **Chat: Open Customizations → MCP Servers** and inspect the workspace server. Use the supplied root launcher; if it is missing, check the active harness, workspace, organization settings and server logs using the [current connection instructions](https://code.visualstudio.com/docs/agent-customization/mcp-servers). Record the VS Code and Copilot versions and configuration path in your report.
3. Only if deliberately using the deprecated Local harness, use **MCP: List Servers**. Its workspace configuration below belongs in `.vscode/mcp.json` and has not been separately exercised in this preview. Keep a single active `kingpin` entry; do not configure both paths to launch duplicate servers.

```json
{
  "servers": {
    "kingpin": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/server.mjs"],
      "env": { "KINGPIN_PROFILE": "normal" }
    }
  }
}
```

4. Start `kingpin` using the controls available in your client and check the server output for discovery. In Copilot Chat select a session with tools enabled and make `read_governed_fixture` available; controls vary by harness and version. Ask “Call read_governed_fixture with {} and show the tool result.” Approve the call if prompted and expand the result to inspect the bytes.
5. In the **active** launcher, change only KINGPIN_PROFILE to lease-required, save, and restart kingpin or run **Developer: Reload Window** and start it again. Repeat the call. A failed tool invocation with the structured refusal above is the expected result.
6. Restore normal in the same launcher, save, restart, and repeat the read. Profiles select synthetic conditions at process startup. The switch starts a fresh demonstration. It implements neither live revocation nor persistent human review.

## Troubleshooting

- **Unable to list tools in VS Code?** If Kingpin is running but Copilot displays “Unable to list tools,” open Copilot Chat, select an available model, and send a message to initialize the session. Then reopen the MCP tools list. This resolved the initial discovery problem during verification on macOS.
- **No tool** — Check folder and server trust, server output, active configuration, tool picker, and organization MCP settings. Restart after editing the configuration.
- **Node cannot launch** — Compare the editor’s environment with the shell where node -v works. Replace command in your local launcher with the full Node executable path printed by node -p process.execPath.
- **Missing module** — Run npm ci in the repository root with development dependencies enabled. The supplied launcher resolves ./server.mjs from the launch working directory. For another working directory use the full server path in the active configuration. The `${workspaceFolder}` example above is specific to the Local harness.
- **Invalid arguments or connection error** — Send exactly {}. Keep server stdout reserved for MCP. Run npm run demo from a terminal to check the SDK path separately from editor discovery.
- **Unexpected refusal or adapter error** — Check which launcher started the process, restart after selecting the intended profile, and check the fixture exists as a regular single-link file within the size limit.

## Scope and adaptation

The host authenticates an ephemeral service bearer and uses the public Kingpin runtime to evaluate the operation. Clients of one process share the configured service identity. The two profiles generate synthetic governance signals. They establish no end-user identity, live behavioral provenance or external lease issuance. State lasts for one process. The integration demonstrates no durable review, rollback, exactly-once delivery or production certification.

For a local experiment after reproducing the baseline, use a disposable copy and replace only the fixed fixture with non-sensitive bytes (up to 4096). Keep directories and files trusted and stable during reads. The reader checks file type, links, identity and size. Concurrent edits have no snapshot guarantee. Re-run the demo to compare the returned bytes with the replacement, then restore the fixture before baseline testing. Another operation needs its own request definition, enforcement boundary, adapter and tests. This tool governs only its own dispatch.

### Name and inspiration

The name **Kingpin** comes from Steven Strogatz’s discussion of highly connected “kingpin proteins” in [*Sync: The Emerging Science of Spontaneous Order*](https://www.stevenstrogatz.com/books/sync-the-emerging-science-of-spontaneous-order) (2003, Chapter 9). The influence of individual nodes within a complex network helped shape Stephen A. Putman’s thinking about system governance.

Kingpin’s software architecture and agent-governance implementation were developed independently. This acknowledgment does not imply affiliation with or endorsement by Strogatz.

## Rights and feedback

The [Kingpin Community License v0.1](LICENSE) from Stephen A. Putman permits personal experimentation, coursework, independent noncommercial research and noncommercial forks of the covered integration. You may rename a fork and distribute source or binaries with the license, original attribution and a summary of changes. Commercial use, defined institutional operations and commissioned deliverables require separate written permission. An authorized commercial evaluation may be free. Production and OEM rights require separate agreements. The separately installed runtime retains CC BY-NC 4.0. See [component notices](NOTICE.md).

For commercial or organizational evaluation permission, [open an evaluation-permission inquiry addressed to Stephen A. Putman](https://github.com/putmanmodel/kingpin-governed-mcp/issues/new?title=Evaluation%20permission%20inquiry). Describe the intended use at a nonconfidential level and ask how to continue privately if needed. Issues are public. An inquiry or reproduction report does not grant permission; separate written permission is required where the license specifies it. This route does not change either component's license.

Successful reproductions are welcome alongside partial attempts and failures. [Open an independent reproduction report](https://github.com/putmanmodel/kingpin-governed-mcp/issues/new?template=independent-reproduction.md) with your commit SHA, environment, commands, test summary, both profile results, first obstacle and any assistance required. Include only sanitized diagnostic excerpts; omit credentials and private data. If you could not reach a step, say “not run” rather than guessing its result.

Stars, forks, sharing and technical feedback are welcome and voluntary.
