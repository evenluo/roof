import { describe, expect, test } from "bun:test";

import { runInspectCommand } from "./index";
import type { AppConfig } from "./config";
import type { NormalizedRecord } from "./types";

const baseConfig: AppConfig = {
  credentials: {
    cloudflare: {
      apiToken: "cf-token",
    },
    tencent: {
      secretId: "secret-id",
      secretKey: "secret-key",
    },
  },
  zones: {
    "ihongben.com": { provider: "tencent" },
    "maxtap.net": { provider: "cloudflare" },
  },
};

const cloudflareRecords: NormalizedRecord[] = [
  {
    name: "@",
    type: "A",
    value: "1.1.1.1",
    ttl: "auto",
    proxied: true,
  },
];

const tencentRecords: NormalizedRecord[] = [
  {
    name: "@",
    type: "A",
    value: "2.2.2.2",
    ttl: 600,
  },
];

describe("runInspectCommand", () => {
  test("outputs both zones as yaml by default", async () => {
    const output = await runInspectCommand(
      {
        command: "inspect",
        format: "yaml",
      },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        inspectCloudflareZone: async () => cloudflareRecords,
        inspectTencentZone: async () => tencentRecords,
      },
    );

    expect(output).toContain("generatedAt:");
    expect(output).toContain("ihongben.com:");
    expect(output).toContain("maxtap.net:");
    expect(output).toContain('provider: "cloudflare"');
    expect(output).toContain('provider: "tencent"');
  });

  test("limits output to a single zone", async () => {
    const output = await runInspectCommand(
      {
        command: "inspect",
        format: "json",
        zone: "ihongben.com",
      },
      {
        config: baseConfig,
        now: () => "2026-03-27T15:00:00+08:00",
        inspectCloudflareZone: async () => {
          throw new Error("should not be called");
        },
        inspectTencentZone: async () => tencentRecords,
      },
    );

    expect(JSON.parse(output)).toEqual({
      generatedAt: "2026-03-27T15:00:00+08:00",
      zones: {
        "ihongben.com": {
          provider: "tencent",
          records: tencentRecords,
        },
      },
    });
  });

  test("adds provider and zone context to errors", async () => {
    await expect(
      runInspectCommand(
        {
          command: "inspect",
          format: "yaml",
          zone: "maxtap.net",
        },
        {
          config: baseConfig,
          now: () => "2026-03-27T15:00:00+08:00",
          inspectCloudflareZone: async () => {
            throw new Error("authentication failed");
          },
          inspectTencentZone: async () => tencentRecords,
        },
      ),
    ).rejects.toThrow(
      'Failed to inspect zone "maxtap.net" from provider "cloudflare": authentication failed',
    );
  });
});
