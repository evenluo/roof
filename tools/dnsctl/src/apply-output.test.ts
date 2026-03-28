import { describe, expect, test } from "bun:test";

import type { ApplyResult } from "./types";

import { formatApplyOutput } from "./apply-output";

describe("formatApplyOutput text", () => {
  test("shows no changes when zone is clean", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [],
          deleted: [],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("No changes applied");
  });

  test("shows created records", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [
            { name: "www", type: "A", value: "1.2.3.4", ttl: 300, proxied: false },
          ],
          updated: [],
          deleted: [],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Created:");
    expect(output).toContain("+ www  A  1.2.3.4");
  });

  test("shows updated records with field changes", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [
            {
              name: "api",
              type: "A",
              changes: { value: { from: "1.1.1.1", to: "2.2.2.2" } },
            },
          ],
          deleted: [],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Updated:");
    expect(output).toContain("~ api  A");
    expect(output).toContain("value: 1.1.1.1 -> 2.2.2.2");
  });

  test("shows deleted records", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [],
          deleted: [{ name: "old", type: "CNAME", value: "legacy.example.com", ttl: 300 }],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Deleted:");
    expect(output).toContain("- old  CNAME  legacy.example.com");
  });

  test("shows per-operation errors", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [],
          deleted: [],
          skippedMultiValue: [],
          errors: [
            {
              operation: "create",
              record: { name: "fail", type: "A", value: "9.9.9.9", ttl: 300 },
              error: "rate limited",
            },
          ],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Errors:");
    expect(output).toContain("create fail A: rate limited");
  });

  test("shows zone-level error", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          error: "API token invalid",
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("Error: API token invalid");
  });

  test("shows summary line when changes were applied", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [{ name: "a", type: "A", value: "1.1.1.1", ttl: 300 }],
          updated: [],
          deleted: [{ name: "b", type: "A", value: "2.2.2.2", ttl: 300 }],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Summary: 1 created, 0 updated, 1 deleted");
  });

  test("shows skipped multi-value records", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [],
          deleted: [],
          skippedMultiValue: [
            { name: "@", type: "MX", value: "mx1.example.com", ttl: 300 },
            { name: "@", type: "MX", value: "mx2.example.com", ttl: 300 },
          ],
          errors: [],
        },
      },
    };

    const output = formatApplyOutput(result, "text");
    expect(output).toContain("Skipped (multi-value):");
    expect(output).toContain("? @  MX");
  });
});

describe("formatApplyOutput json", () => {
  test("serializes the full result as JSON", () => {
    const result: ApplyResult = {
      file: "dns/dns.yaml",
      generatedAt: "2026-01-01T00:00:00.000Z",
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          created: [],
          updated: [],
          deleted: [],
          errors: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatApplyOutput(result, "json");
    expect(JSON.parse(output)).toEqual(result);
  });
});
