import { describe, expect, test } from "bun:test";

import type { AppConfig } from "./config";
import type { NormalizedRecord } from "./types";
import { runImportCommand } from "./import";

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

const cloudflareRecords: NormalizedRecord[] = [
  { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
  { name: "www", type: "CNAME", value: "pages.dev", ttl: 300, proxied: false },
];

const tencentRecords: NormalizedRecord[] = [
  { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
];

describe("runImportCommand", () => {
  test("writes declaration YAML for all zones", async () => {
    const written: { path: string; content: string }[] = [];

    await runImportCommand(
      { command: "import", output: "dns/dns.yaml", force: false },
      {
        config: baseConfig,
        inspectCloudflareZone: async () => cloudflareRecords,
        inspectTencentZone: async () => tencentRecords,
        fileExists: () => false,
        writeOutput: (path, content) => written.push({ path, content }),
      },
    );

    expect(written).toHaveLength(1);
    expect(written[0].path).toContain("dns/dns.yaml");

    const content = written[0].content;
    expect(content).toContain("zones:");
    expect(content).toContain("maxtap.net:");
    expect(content).toContain("ihongben.com:");
    expect(content).toContain("cloudflare");
    expect(content).toContain("tencent");
    expect(content).toContain("1.1.1.1");
    expect(content).toContain("2.2.2.2");
  });

  test("errors when file exists without --force", async () => {
    await expect(
      runImportCommand(
        { command: "import", output: "dns/dns.yaml", force: false },
        {
          config: baseConfig,
          inspectCloudflareZone: async () => cloudflareRecords,
          inspectTencentZone: async () => tencentRecords,
          fileExists: () => true,
          writeOutput: () => {},
        },
      ),
    ).rejects.toThrow("File already exists: dns/dns.yaml. Use --force to overwrite.");
  });

  test("overwrites when --force is set", async () => {
    const written: string[] = [];

    await runImportCommand(
      { command: "import", output: "dns/dns.yaml", force: true },
      {
        config: baseConfig,
        inspectCloudflareZone: async () => cloudflareRecords,
        inspectTencentZone: async () => tencentRecords,
        fileExists: () => true,
        writeOutput: (_, content) => written.push(content),
      },
    );

    expect(written).toHaveLength(1);
  });

  test("imports only the specified zone", async () => {
    const written: { path: string; content: string }[] = [];

    await runImportCommand(
      { command: "import", output: "dns/dns.yaml", zone: "maxtap.net", force: false },
      {
        config: baseConfig,
        inspectCloudflareZone: async () => cloudflareRecords,
        inspectTencentZone: async () => {
          throw new Error("should not be called");
        },
        fileExists: () => false,
        writeOutput: (path, content) => written.push({ path, content }),
      },
    );

    expect(written).toHaveLength(1);
    const content = written[0].content;
    expect(content).toContain("maxtap.net:");
    expect(content).not.toContain("ihongben.com:");
  });

  test("errors when zone is not in config", async () => {
    await expect(
      runImportCommand(
        { command: "import", output: "dns/dns.yaml", zone: "unknown.example.com", force: false },
        {
          config: baseConfig,
          inspectCloudflareZone: async () => cloudflareRecords,
          inspectTencentZone: async () => tencentRecords,
          fileExists: () => false,
          writeOutput: () => {},
        },
      ),
    ).rejects.toThrow('Zone "unknown.example.com" is not configured');
  });

  test("wraps provider errors with zone context", async () => {
    await expect(
      runImportCommand(
        { command: "import", output: "dns/dns.yaml", force: false },
        {
          config: baseConfig,
          inspectCloudflareZone: async () => {
            throw new Error("authentication failed");
          },
          inspectTencentZone: async () => tencentRecords,
          fileExists: () => false,
          writeOutput: () => {},
        },
      ),
    ).rejects.toThrow(
      'Failed to import zone "maxtap.net" from provider "cloudflare": authentication failed',
    );
  });
});
