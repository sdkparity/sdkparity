# SDK Parity

SDK Parity is open-source tooling for describing and comparing API SDK public
surfaces.

This repository is intentionally limited to public, reusable components.

## Scope

- `sdkparity audit`: inspect an OpenAPI spec and existing SDK repositories.
- SDK surface manifests: structured descriptions of public SDK methods, models,
  auth, errors, pagination, retries, files, webhooks, and package metadata.
- Compatibility diffing: compare two SDK surface manifests.
- Public fixtures and tests for supported extractors.

## Privacy

Do not commit customer data, private infrastructure details, or internal
materials to this repository.

Keep public materials limited to reusable source code, public fixtures, and
documentation needed to use the open-source package.
