import { describe, expect, test } from "bun:test";

import { parseCliArgs } from "./cli";

describe("parseCliArgs", () => {
  test("uses yaml output by default", () => {
    expect(parseCliArgs(["inspect"])).toEqual({
      command: "inspect",
      format: "yaml",
    });
  });

  test("switches to json output with --json", () => {
    expect(parseCliArgs(["inspect", "--json"])).toEqual({
      command: "inspect",
      format: "json",
    });
  });

  test("selects a single zone with --zone", () => {
    expect(parseCliArgs(["inspect", "--zone", "ihongben.com"])).toEqual({
      command: "inspect",
      format: "yaml",
      zone: "ihongben.com",
    });
  });

  test("rejects unsupported zones", () => {
    expect(() => parseCliArgs(["inspect", "--zone", "example.com"])).toThrow(
      'Unsupported zone: example.com',
    );
  });

  test("rejects unknown flags", () => {
    expect(() => parseCliArgs(["inspect", "--yaml"])).toThrow(
      "Unknown argument: --yaml",
    );
  });
});
