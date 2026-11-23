# Kingpin MCP integration notices

Original Kingpin MCP integration credit: Stephen A. Putman. See LICENSE for covered material.

The Kingpin MCP integration incorporates the enforcer, acceptance tests and fixture from the Kingpin standalone governed tool consumer. The host and fixture reader adapt the consumer for MCP.

Preserve original credits and applicable license notices when redistributing covered source or binaries. Identify modified components and summarize your changes in a notice or changelog included with the copy. You may give a noncommercial fork its own name and credit its contributors for their additions.

The separately installed `kingpin-runtime@0.1.0-rc.4` is the standalone authority component of the putmanmodel agent-tool-governance-gateway project. It retains CC BY-NC 4.0. See the installed runtime's LICENSE and NOTICE.md. Copies that include the runtime must carry its applicable attribution and license information. [Runtime source](https://github.com/putmanmodel/agent-tool-governance-gateway) · [Runtime license](https://creativecommons.org/licenses/by-nc/4.0/)

The MCP SDK and Zod packages are installed separately under their own terms. Preserve applicable package licenses and notices if redistributing them. Project names identify their respective components and imply no endorsement.

## Local npm package candidate changes — November 22, 2026

Based on upstream `putmanmodel/kingpin-governed-mcp` commit `d825ff7997c443003ec9d2880db2db195e648353`. Packaging additions prepared for owner review:

- `server.mjs` and `demo.mjs`: added executable shebangs and file modes; retained Node entry-point checks and existing behavior.
- `package.json`: added npm executable mappings, an explicit file allowlist, repository and custom-license metadata, and the qualified npm engine version; moved the demo's MCP client into production dependencies and pinned the existing transitive dependency closure for local tarball installation; separated installed-artifact qualification from the original tests.
- `package-lock.json` replaced by published `npm-shrinkwrap.json`: retained dependency versions, registry locations and integrity values while updating package metadata and production dependency classification.
- `README.md` and this notice: documented local tarball installation and the packaging changes. Separate source-only packaging qualification scripts and evidence accompany the candidate review.

No change to the component license terms, runtime package, fixture bytes, governance behavior or synthetic profiles. This candidate does not announce an npm publication.
