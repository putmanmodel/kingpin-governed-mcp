# Kingpin governed fixture reader

Kingpin is a Node.js MCP tool authorization example demonstrating how the same tool request can be permitted or explicitly refused depending on its authority. Call `read_governed_fixture` with `{}` to request the contents of `fixtures/message.txt`. The host owns the path and evaluates each call before entering the reader. A client cannot supply a path, identity, profile or lease through the tool arguments.

## Run locally

From the repository root, use Node 24.14.1 and npm 11.11.0. The reference environment is macOS on Apple silicon. Other platforms, Node versions and remote transports are unverified. The command-line demo needs no Copilot account.

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

The latter three statuses set MCP isError. Inspect the structured result and its request ID. Server diagnostics go to stderr. A transport or protocol failure can occur before any tool result exists.

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

1. Install dependencies as above. Enable Copilot Chat, sign in, and open the repository itself with File → Open Folder. Inspect the launcher and server before granting Workspace Trust. If the folder opened in Restricted Mode, use the Workspace Trust command to trust this folder when ready.
2. Open the Command Palette and run **MCP: List Servers**. If kingpin is listed from the supplied launcher, select it and start it. Approve the server trust prompt after checking its command. The supplied root .mcp.json uses mcpServers and initially selects normal.
3. If your VS Code installation does not discover that launcher, create a local .vscode/mcp.json with the following VS Code workspace configuration. Use a single active kingpin entry. This alternative follows the editor’s documented configuration format and has not been separately exercised in this preview.

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

4. Start kingpin from the server list. Check its output for Running and discovery. In Copilot Chat select an agent session with tools enabled, open the tool picker, and enable read_governed_fixture. Ask “Call read_governed_fixture with {} and show the tool result.” Approve the call if prompted and expand the result to inspect the bytes.
5. In the **active** launcher, change only KINGPIN_PROFILE to lease-required, save, and restart kingpin or run **Developer: Reload Window** and start it again. Repeat the call. A failed tool invocation with the structured refusal above is the expected result.
6. Restore normal in the same launcher, save, restart, and repeat the read. Profiles select synthetic conditions at process startup. The switch starts a fresh demonstration. It implements neither live revocation nor persistent human review.

## Troubleshooting

- **Unable to list tools in VS Code?** If Kingpin is running but Copilot displays “Unable to list tools,” open Copilot Chat, select an available model, and send a message to initialize the session. Then reopen the MCP tools list. This resolved the initial discovery problem during verification on macOS.
- **No tool** — Check folder and server trust, server output, active configuration, tool picker, and organization MCP settings. Restart after editing the configuration.
- **Node cannot launch** — Compare the editor’s environment with the shell where node -v works. Replace command in your local launcher with the full Node executable path printed by node -p process.execPath.
- **Missing module** — Run npm ci in the repository root with development dependencies enabled. The supplied launcher resolves ./server.mjs from the launch working directory. For another working directory use the full server path or the workspace configuration above.
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

Try reproducing both the normal-profile permitted read and the lease-required refusal. We welcome reports of your operating system and relevant versions, Node.js and npm versions, MCP client or editor, whether both outcomes worked, and any installation difficulties or unexpected behavior. Please omit credentials and private data from logs. [Share feedback on GitHub Issues](https://github.com/putmanmodel/kingpin-governed-mcp/issues).

Stars, forks, sharing and technical feedback are welcome and voluntary.
