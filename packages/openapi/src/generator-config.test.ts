import { expect, test } from "bun:test";
import { sdkGeneratorConfigSchema } from "./generator-config.js";

test("validates rich SDK generator config contracts", () => {
  const parsed = sdkGeneratorConfigSchema.parse({
    input: "openapi.json",
    output: "generated/pulse",
    packageName: "@acme/pulse-sdk",
    clientName: "PulseClient",
    envPrefix: "PULSE",
    targets: {
      typescript: { packageName: "@acme/pulse-sdk" },
      python: { packageName: "acme-pulse", moduleName: "pulse_sdk" },
      docs: { title: "Pulse API SDK" },
      cli: { packageName: "@acme/pulse-sdk-cli", binaryName: "pulse" },
      mcp: {
        enabled: true,
        codeMode: true,
        responseFilters: {
          listEvents: { type: "fields", fields: ["data", "next_cursor"] }
        },
        sandbox: {
          adapter: "local-safe",
          allowNetwork: false,
          allowFilesystem: false,
          allowedEnvironmentVariables: ["PULSE_API_KEY"]
        }
      }
    },
    reliability: {
      maxRetries: 2,
      timeoutMs: 60_000,
      retryHeaderName: "x-sdkparity-retry-count",
      idempotency: {
        enabled: true,
        headerName: "Idempotency-Key",
        autoGenerate: true
      },
      rateLimit: {
        maxConcurrent: 8,
        requestsPerSecond: 20,
        burst: 20
      },
      operations: {
        createEvent: {
          maxRetries: 4,
          retryableStatuses: [429, 500]
        }
      }
    },
    resources: {
      events: { propertyName: "events", className: "EventsResource" }
    },
    operations: {
      getHealth: { auth: false, methodName: "getHealth" }
    },
    pagination: {
      listEvents: {
        strategy: "cursor",
        inputTokenPath: "after",
        outputTokenPath: "next_cursor",
        itemPath: "data"
      }
    },
    auth: { type: "bearer", envName: "PULSE_API_KEY" },
    environments: {
      default: { url: "https://api.pulse.example/v1" }
    },
    transforms: [{ type: "renameResource", selector: "events", value: "timeline" }],
    examples: {
      listEvents: { title: "List events", params: { limit: 1 } }
    },
    docs: {
      versionLabel: "2026-05-21",
      migration: { notes: ["Synthetic public example."] }
    },
    package: {
      license: "Apache-2.0",
      release: { npm: true, provenance: true }
    }
  });

  expect(parsed.targets.mcp?.responseFilters?.listEvents?.type).toBe("fields");
  expect(parsed.operations?.getHealth?.auth).toBe(false);
  expect(parsed.pagination?.listEvents?.strategy).toBe("cursor");
});

test("rejects unsupported generator config keys", () => {
  expect(() =>
    sdkGeneratorConfigSchema.parse({
      input: "openapi.json",
      output: "generated",
      packageName: "bad",
      targets: {},
      unsupportedEndpoint: "https://example.invalid"
    })
  ).toThrow();
});
