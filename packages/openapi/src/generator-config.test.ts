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
      backoff: {
        initialDelayMs: 500,
        maxDelayMs: 8_000,
        maxElapsedMs: 60_000,
        multiplier: 2,
        jitter: 0.25
      },
      operations: {
        createEvent: {
          maxRetries: 4,
          retryableStatuses: [429, 500],
          backoff: { maxElapsedMs: 30_000 }
        }
      }
    },
    resources: {
      events: { propertyName: "events", className: "EventsResource" }
    },
    operations: {
      getHealth: { auth: false, methodName: "getHealth" },
      listEvents: { auth: { type: "apiKey", in: "query", queryName: "api_key" } },
      basicOnly: { auth: { type: "basic", usernameEnvName: "PULSE_USERNAME", passwordEnvName: "PULSE_PASSWORD" } }
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
      homepage: "https://sdkparity.example",
      keywords: ["sdk", "openapi"],
      release: { npm: true, provenance: true }
    }
  });

  expect(parsed.targets.mcp?.responseFilters?.listEvents?.type).toBe("fields");
  expect(parsed.reliability?.backoff?.maxElapsedMs).toBe(60_000);
  expect(parsed.reliability?.operations?.createEvent?.backoff?.maxElapsedMs).toBe(30_000);
  expect(parsed.operations?.getHealth?.auth).toBe(false);
  const listEventsAuth = parsed.operations?.listEvents?.auth;
  const basicOnlyAuth = parsed.operations?.basicOnly?.auth;
  expect(listEventsAuth && typeof listEventsAuth === "object" ? listEventsAuth.queryName : undefined).toBe(
    "api_key"
  );
  expect(basicOnlyAuth && typeof basicOnlyAuth === "object" ? basicOnlyAuth.type : undefined).toBe(
    "basic"
  );
  expect(parsed.package?.homepage).toBe("https://sdkparity.example");
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

test("rejects retry backoff values that cannot be applied in order", () => {
  expect(() =>
    sdkGeneratorConfigSchema.parse({
      input: "openapi.json",
      output: "generated",
      packageName: "bad-backoff",
      targets: {},
      reliability: {
        backoff: {
          initialDelayMs: 10_000,
          maxDelayMs: 1_000,
          maxElapsedMs: 60_000
        }
      }
    })
  ).toThrow(/initialDelayMs/);

  expect(() =>
    sdkGeneratorConfigSchema.parse({
      input: "openapi.json",
      output: "generated",
      packageName: "bad-elapsed",
      targets: {},
      reliability: {
        backoff: {
          maxDelayMs: 60_000,
          maxElapsedMs: 1_000
        }
      }
    })
  ).toThrow(/maxDelayMs/);
});

test("rejects auth fields that do not match the selected auth strategy", () => {
  expect(() =>
    sdkGeneratorConfigSchema.parse({
      input: "openapi.json",
      output: "generated",
      packageName: "bad-auth",
      targets: {},
      auth: { type: "apiKey", in: "query", headerName: "X-Api-Key" }
    })
  ).toThrow(/headerName/);

  expect(() =>
    sdkGeneratorConfigSchema.parse({
      input: "openapi.json",
      output: "generated",
      packageName: "bad-basic",
      targets: {},
      auth: { type: "bearer", usernameEnvName: "SDK_USERNAME", passwordEnvName: "SDK_PASSWORD" }
    })
  ).toThrow(/usernameEnvName/);
});
