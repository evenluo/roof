import { describe, expect, test } from "bun:test";

import { parseCliArgs } from "./cli";

describe("parseCliArgs help", () => {
  test("shows top-level help with no args", () => {
    expect(parseCliArgs([])).toEqual({ command: "help" });
  });

  test("shows top-level help with --help", () => {
    expect(parseCliArgs(["--help"])).toEqual({ command: "help" });
  });

  test("shows top-level help with -h", () => {
    expect(parseCliArgs(["-h"])).toEqual({ command: "help" });
  });

  test("shows inspect help with inspect --help", () => {
    expect(parseCliArgs(["inspect", "--help"])).toEqual({
      command: "help",
      topic: "inspect",
    });
  });

  test("shows plan help with plan --help", () => {
    expect(parseCliArgs(["plan", "--help"])).toEqual({
      command: "help",
      topic: "plan",
    });
  });

  test("shows plan help with plan -h", () => {
    expect(parseCliArgs(["plan", "-h"])).toEqual({
      command: "help",
      topic: "plan",
    });
  });
});

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

describe("parseCliArgs plan", () => {
  test("uses text output and default file by default", () => {
    expect(parseCliArgs(["plan"])).toEqual({
      command: "plan",
      format: "text",
      file: "tools/dnsctl/dns/dns.yaml",
    });
  });

  test("switches to json output with --json", () => {
    expect(parseCliArgs(["plan", "--json"])).toEqual({
      command: "plan",
      format: "json",
      file: "tools/dnsctl/dns/dns.yaml",
    });
  });

  test("overrides file path with --file", () => {
    expect(parseCliArgs(["plan", "--file", "custom.yaml"])).toEqual({
      command: "plan",
      format: "text",
      file: "custom.yaml",
    });
  });

  test("accepts --zone for single zone plan", () => {
    expect(parseCliArgs(["plan", "--zone", "maxtap.net"])).toEqual({
      command: "plan",
      format: "text",
      file: "tools/dnsctl/dns/dns.yaml",
      zone: "maxtap.net",
    });
  });

  test("rejects missing value for --file", () => {
    expect(() => parseCliArgs(["plan", "--file"])).toThrow(
      "Missing value for --file",
    );
  });

  test("rejects missing value for --zone", () => {
    expect(() => parseCliArgs(["plan", "--zone"])).toThrow(
      "Missing value for --zone",
    );
  });

  test("rejects unknown flags", () => {
    expect(() => parseCliArgs(["plan", "--yaml"])).toThrow(
      "Unknown argument: --yaml",
    );
  });
});

describe("parseCliArgs apply", () => {
  test("uses text output and default file by default", () => {
    expect(parseCliArgs(["apply"])).toEqual({
      command: "apply",
      format: "text",
      file: "tools/dnsctl/dns/dns.yaml",
    });
  });

  test("switches to json output with --json", () => {
    expect(parseCliArgs(["apply", "--json"])).toEqual({
      command: "apply",
      format: "json",
      file: "tools/dnsctl/dns/dns.yaml",
    });
  });

  test("overrides file path with --file", () => {
    expect(parseCliArgs(["apply", "--file", "custom.yaml"])).toEqual({
      command: "apply",
      format: "text",
      file: "custom.yaml",
    });
  });

  test("accepts --zone for single zone apply", () => {
    expect(parseCliArgs(["apply", "--zone", "maxtap.net"])).toEqual({
      command: "apply",
      format: "text",
      file: "tools/dnsctl/dns/dns.yaml",
      zone: "maxtap.net",
    });
  });

  test("rejects missing value for --file", () => {
    expect(() => parseCliArgs(["apply", "--file"])).toThrow(
      "Missing value for --file",
    );
  });

  test("rejects missing value for --zone", () => {
    expect(() => parseCliArgs(["apply", "--zone"])).toThrow(
      "Missing value for --zone",
    );
  });

  test("rejects unknown flags", () => {
    expect(() => parseCliArgs(["apply", "--yaml"])).toThrow(
      "Unknown argument: --yaml",
    );
  });

  test("shows apply help with apply --help", () => {
    expect(parseCliArgs(["apply", "--help"])).toEqual({
      command: "help",
      topic: "apply",
    });
  });
});
