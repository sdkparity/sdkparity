import { expect, test } from "bun:test";
import { SdkParityError, toSdkParityError } from "./errors";

test("serializes SDK Parity errors with optional details and suggestions", () => {
  const error = new SdkParityError({
    code: "fixture_failed",
    message: "Fixture failed.",
    details: { path: "fixture.json" },
    suggestion: "Use a valid fixture."
  });

  expect(error.name).toBe("SdkParityError");
  expect(error.toJSON()).toEqual({
    code: "fixture_failed",
    message: "Fixture failed.",
    details: { path: "fixture.json" },
    suggestion: "Use a valid fixture."
  });
});

test("normalizes unknown thrown values into SDK Parity errors", () => {
  const existing = new SdkParityError({ code: "already_typed", message: "Already typed." });
  expect(toSdkParityError(existing)).toBe(existing);

  expect(toSdkParityError(new Error("Native failure.")).toJSON()).toEqual({
    code: "unexpected_error",
    message: "Native failure."
  });

  expect(toSdkParityError("plain failure").toJSON()).toEqual({
    code: "unexpected_error",
    message: "An unexpected error occurred.",
    details: { value: "plain failure" }
  });
});
