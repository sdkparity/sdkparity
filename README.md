# SDK Parity

SDK Parity is open-source tooling for describing and comparing API SDK public
surfaces.

This repository is intentionally limited to public, reusable components.

## Scope

- `sdkparity spec lint`: inspect an OpenAPI document.
- `sdkparity spec normalize`: produce a normalized operation manifest from an
  OpenAPI document.
- `sdkparity manifest create`: extract a TypeScript SDK public surface.
- `sdkparity compat diff`: compare two SDK surface manifests.
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
```

## Privacy

Do not commit non-public material to this repository.

Keep materials limited to reusable source code, synthetic fixtures, and
documentation needed to use the open-source package.
