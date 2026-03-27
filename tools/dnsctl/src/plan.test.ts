import { describe, expect, test } from "bun:test";

import { runPlanCommand } from "./plan";
import type { AppConfig } from "./config";
import type { NormalizedRecord } from "./types";
import type { Declaration } from "./declaration";

const baseConfig: AppConfig = {
  credentials: {
    cloudflare: { apiToken: "cf-token" },
    tencent: { secretId: "secret-id", secretKey: "secret-key" },
  },
  zones: {
    "ihongben.com": { provider: "tencent" },
    "maxtap.net": { provider: "cloudflare" },
  },
};

const declaration: Declaration = {
  zones: {
    "ihongben.com": {
      provider: "tencent",
      records: [
        { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
      ],
    },
    "maxtap.net": {
      provider: "cloudflare",
      records: [
        { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
      ],
    },
  },
};

const remoteCloudflare: NormalizedRecord[] = [
  { name: "@", type: "A", value: "1.0.0.1", ttl: "auto", proxied: false },
  { name: "@", type: "NS", value: "ns1.cloudflare.com", ttl: 86400 },
];

const remoteTencent: NormalizedRecord[] = [
  { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
];

describe("runPlanCommand", () => {
  test("produces text diff for all zones", async () => {
    const output = await runPlanCommand(
      { command: "plan", format: "text", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencent,
      },
    );

    expect(output).toContain("Zone: ihongben.com (tencent)");
    expect(output).toContain("No changes");
    expect(output).toContain("Zone: maxtap.net (cloudflare)");
    expect(output).toContain("Update:");
    expect(output).toContain("value: 1.0.0.1 -> 1.1.1.1");
    expect(output).toContain("proxied: false -> true");
  });

  test("produces json output", async () => {
    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencent,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.file).toBe("dns/dns.yaml");
    expect(parsed.zones["ihongben.com"].creates).toEqual([]);
    expect(parsed.zones["ihongben.com"].updates).toEqual([]);
    expect(parsed.zones["ihongben.com"].deletes).toEqual([]);
    expect(parsed.zones["maxtap.net"].updates.length).toBe(1);
  });

  test("filters to single zone with --zone", async () => {
    let cloudflareCalled = false;

    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml", zone: "ihongben.com" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => declaration,
        inspectCloudflareZone: async () => {
          cloudflareCalled = true;
          return remoteCloudflare;
        },
        inspectTencentZone: async () => remoteTencent,
      },
    );

    const parsed = JSON.parse(output);

    expect(cloudflareCalled).toBe(false);
    expect(Object.keys(parsed.zones)).toEqual(["ihongben.com"]);
  });

  test("rejects --zone not in declaration", async () => {
    await expect(
      runPlanCommand(
        { command: "plan", format: "text", file: "dns/dns.yaml", zone: "unknown.com" },
        {
          config: baseConfig,
          now: () => "2026-03-27T15:00:00+08:00",
          loadDeclaration: () => declaration,
          inspectCloudflareZone: async () => [],
          inspectTencentZone: async () => [],
        },
      ),
    ).rejects.toThrow('Zone "unknown.com" not found in declaration file');
  });

  test("adds provider context to query errors", async () => {
    await expect(
      runPlanCommand(
        { command: "plan", format: "text", file: "dns/dns.yaml", zone: "maxtap.net" },
        {
          config: baseConfig,
          now: () => "2026-03-27T15:00:00+08:00",
          loadDeclaration: () => declaration,
          inspectCloudflareZone: async () => {
            throw new Error("auth failed");
          },
          inspectTencentZone: async () => [],
        },
      ),
    ).rejects.toThrow(
      'Failed to query zone "maxtap.net" from provider "cloudflare": auth failed',
    );
  });

  test("catches remote duplicate error and continues", async () => {
    const mixedDeclaration: Declaration = {
      zones: {
        "ihongben.com": {
          provider: "tencent",
          records: [
            { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
          ],
        },
        "maxtap.net": {
          provider: "cloudflare",
          records: [
            { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
          ],
        },
      },
    };

    const remoteTencentWithDupes: NormalizedRecord[] = [
      { name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600 },
      { name: "mail", type: "MX", value: "mx2.example.com.", ttl: 600 },
      { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
    ];

    const output = await runPlanCommand(
      { command: "plan", format: "json", file: "dns/dns.yaml" },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        loadDeclaration: () => mixedDeclaration,
        inspectCloudflareZone: async () => remoteCloudflare,
        inspectTencentZone: async () => remoteTencentWithDupes,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.zones["ihongben.com"].error).toContain("Duplicate name+type");
    expect(parsed.zones["maxtap.net"].updates.length).toBe(1);
  });
});
