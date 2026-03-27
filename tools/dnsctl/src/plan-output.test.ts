import { describe, expect, test } from "bun:test";

import { formatPlanOutput } from "./plan-output";
import type { PlanResult } from "./types";

const basePlan: PlanResult = {
  file: "dns/dns.yaml",
  generatedAt: "2026-03-27T15:00:00+08:00",
  zones: {},
};

describe("formatPlanOutput text", () => {
  test("formats create, update, delete with summary", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
          ],
          updates: [
            {
              name: "@",
              type: "A",
              changes: {
                value: { from: "1.0.0.1", to: "1.1.1.1" },
                proxied: { from: false, to: true },
              },
            },
          ],
          deletes: [
            { name: "old-api", type: "CNAME", value: "legacy.example.com", ttl: 300 },
          ],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("Create:");
    expect(output).toContain("+ blog  A  1.2.3.4  ttl=600");
    expect(output).toContain("Update:");
    expect(output).toContain("~ @  A");
    expect(output).toContain("value: 1.0.0.1 -> 1.1.1.1");
    expect(output).toContain("proxied: false -> true");
    expect(output).toContain("Delete:");
    expect(output).toContain("- old-api  CNAME  legacy.example.com  ttl=300");
    expect(output).toContain("Summary: 1 to create, 1 to update, 1 to delete");
  });

  test("shows no changes when diff is empty", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "ihongben.com": {
          provider: "tencent",
          creates: [],
          updates: [],
          deletes: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: ihongben.com (tencent)");
    expect(output).toContain("No changes");
    expect(output).not.toContain("Summary:");
  });

  test("shows proxied in create and delete lines", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "www", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
          ],
          updates: [],
          deletes: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("+ www  A  1.1.1.1  ttl=auto  proxied");
  });

  test("shows skipped multi-value records", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "ihongben.com": {
          provider: "tencent",
          creates: [],
          updates: [],
          deletes: [],
          skippedMultiValue: [
            { name: "_dnsauth", type: "TXT", value: "token-1", ttl: 600 },
            { name: "_dnsauth", type: "TXT", value: "token-2", ttl: 600 },
          ],
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: ihongben.com (tencent)");
    expect(output).toContain("Skipped (multi-value):");
    expect(output).toContain("? _dnsauth  TXT  token-1  ttl=600");
    expect(output).toContain("? _dnsauth  TXT  token-2  ttl=600");
    expect(output).not.toContain("Summary:");
  });

  test("shows error for zones with errors", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "example.com": {
          provider: "tencent",
          error: "Duplicate name+type in remote records: mail MX (2 records)",
        },
      },
    };

    const output = formatPlanOutput(plan, "text");

    expect(output).toContain("Zone: example.com (tencent)");
    expect(output).toContain("Error: Duplicate name+type in remote records: mail MX (2 records)");
  });
});

describe("formatPlanOutput json", () => {
  test("outputs valid JSON with full structure", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          creates: [
            { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
          ],
          updates: [
            {
              name: "@",
              type: "A",
              changes: {
                value: { from: "1.0.0.1", to: "1.1.1.1" },
              },
            },
          ],
          deletes: [],
          skippedMultiValue: [],
        },
      },
    };

    const output = formatPlanOutput(plan, "json");
    const parsed = JSON.parse(output);

    expect(parsed.file).toBe("dns/dns.yaml");
    expect(parsed.generatedAt).toBe("2026-03-27T15:00:00+08:00");
    expect(parsed.zones["maxtap.net"].provider).toBe("cloudflare");
    expect(parsed.zones["maxtap.net"].creates).toEqual([
      { name: "blog", type: "A", value: "1.2.3.4", ttl: 600 },
    ]);
    expect(parsed.zones["maxtap.net"].updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          value: { from: "1.0.0.1", to: "1.1.1.1" },
        },
      },
    ]);
  });

  test("includes error zones in JSON output", () => {
    const plan: PlanResult = {
      ...basePlan,
      zones: {
        "example.com": {
          provider: "tencent",
          error: "Duplicate records",
        },
      },
    };

    const output = formatPlanOutput(plan, "json");
    const parsed = JSON.parse(output);

    expect(parsed.zones["example.com"]).toEqual({
      provider: "tencent",
      error: "Duplicate records",
    });
  });
});
