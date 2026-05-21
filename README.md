# SDK Parity

SDK Parity is open-source tooling for describing and comparing API SDK public
surfaces.

This repository is intentionally limited to public, reusable components.

## Scope

- `sdkparity spec lint`: inspect an OpenAPI document.
- `sdkparity spec normalize`: produce a normalized operation manifest from an
  OpenAPI document.
- `sdkparity manifest create`: extract TypeScript and Python SDK public surfaces.
- `sdkparity compat diff`: compare two SDK surface manifests.
- `sdkparity sdk generate`: generate a deterministic TypeScript or Python SDK.
- Public generator config schemas for richer SDK targets, reliability,
  pagination, auth, docs, CLI, MCP, and release metadata.
- `sdkparity run generate`: run a local evidence pipeline for generated SDKs,
  snippets, MCP manifests, Code Mode typings, agent eval/readiness reports,
  compatibility reports, and release dry-run plans.
- SDK surface manifests: structured descriptions of public SDK methods, models,
  auth, errors, pagination, retries, files, webhooks, and package metadata.
- Public fixtures and tests for supported extractors.

## Quickstart

```bash
bun install
bun run sdkparity spec normalize fixtures/synthetic/openapi/base.json
bun run sdkparity manifest create --language ts --repo fixtures/synthetic/ts-sdk-old --output old.json
bun run sdkparity manifest create --language ts --repo fixtures/synthetic/ts-sdk-new --output new.json
bun run sdkparity compat diff old.json new.json --format markdown
bun run sdkparity run generate --spec fixtures/synthetic/openapi/base.json --languages typescript,python --output-dir .tmp/sdkparity-run
```

## Privacy

Do not commit non-public material to this repository.

Keep materials limited to reusable source code, synthetic fixtures, and
documentation needed to use the open-source package.
