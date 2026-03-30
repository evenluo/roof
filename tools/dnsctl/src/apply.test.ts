import { describe, expect, test } from "bun:test";

import type { AppConfig } from "./config";
import type { Declaration } from "./declaration";
import type { CloudflareRawRecord } from "./providers/cloudflare";
import type { TencentManagedRecord } from "./types";

import { runApplyCommand } from "./apply";

const baseConfig: AppConfig = {
  credentials: {
    cloudflare: { apiToken: "cf-token" },
    tencent: { secretId: "secret-id", secretKey: "secret-key" },
    aliyun: { accessKeyId: "ali-key-id", accessKeySecret: "ali-key-secret" },
  },
  zones: {
    "ihongben.com": { provider: "tencent" },
    "maxtap.net": { provider: "cloudflare" },
    "jctx.cc": { provider: "aliyun" },
    "junlintianxia.icu": { provider: "aliyun" },
    "junlintianxia.top": { provider: "aliyun" },
  },
};

const declaration: Declaration = {
  zones: {
    "maxtap.net": {
      provider: "cloudflare",
      records: [
        { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
        { name: "www", type: "CNAME", value: "pages.dev", ttl: 300, proxied: false },
      ],
    },
    "ihongben.com": {
      provider: "tencent",
      records: [
        { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
      ],
    },
  },
};

const remoteCloudflare: CloudflareRawRecord[] = [
  { id: "rec-1", name: "maxtap.net", type: "A", content: "1.0.0.1", ttl: 1, proxied: false },
];

const remoteTencent: TencentManagedRecord[] = [
  { recordId: 101, name: "@", type: "A", value: "2.2.2.2", ttl: 600, line: "默认", updatedOn: "" },
  { recordId: 102, name: "old", type: "CNAME", value: "gone.example.com.", ttl: 300, line: "默认", updatedOn: "" },
];

const noopDeps = {
  config: baseConfig,
  now: () => "2026-03-28T00:00:00.000Z",
  loadDeclaration: () => declaration,
  fetchCloudflareZoneWithIds: async () => remoteCloudflare,
  createCloudflareRecord: async () => {},
  updateCloudflareRecord: async () => {},
  deleteCloudflareRecord: async () => {},
  fetchTencentZoneWithIds: async () => remoteTencent,
  createTencentRecord: async () => {},
  modifyTencentRecord: async () => {},
  deleteTencentRecord: async () => {},
};

describe("runApplyCommand", () => {
  test("creates missing records and updates changed ones", async () => {
    const created: string[] = [];
    const updated: string[] = [];

    const { output } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml" },
      {
        ...noopDeps,
        createCloudflareRecord: async ({ record }) => { created.push(`cf:${record.name}:${record.type}`); },
        updateCloudflareRecord: async ({ record }) => { updated.push(`cf:${record.name}:${record.type}`); },
      },
    );

    expect(created).toContain("cf:www:CNAME");
    expect(updated).toContain("cf:@:A");

    const parsed = JSON.parse(output);
    expect(parsed.zones["maxtap.net"].created).toHaveLength(1);
    expect(parsed.zones["maxtap.net"].updated).toHaveLength(1);
    expect(parsed.zones["maxtap.net"].deleted).toHaveLength(0);
  });

  test("deletes records absent from declaration", async () => {
    const deleted: number[] = [];

    await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml" },
      {
        ...noopDeps,
        deleteTencentRecord: async ({ recordId }) => { deleted.push(recordId); },
      },
    );

    expect(deleted).toContain(102);
    expect(deleted).not.toContain(101);
  });

  test("passes line to modifyTencentRecord", async () => {
    const modifyCalls: Array<{ recordId: number; line: string }> = [];

    const remoteTencentChanged: TencentManagedRecord[] = [
      { recordId: 101, name: "@", type: "A", value: "9.9.9.9", ttl: 600, line: "默认", updatedOn: "" },
    ];

    await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "ihongben.com" },
      {
        ...noopDeps,
        fetchTencentZoneWithIds: async () => remoteTencentChanged,
        modifyTencentRecord: async ({ recordId, line }) => { modifyCalls.push({ recordId, line }); },
      },
    );

    expect(modifyCalls).toHaveLength(1);
    expect(modifyCalls[0]).toMatchObject({ recordId: 101, line: "默认" });
  });

  test("records per-operation errors without aborting zone", async () => {
    const { output } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        createCloudflareRecord: async () => { throw new Error("rate limited"); },
      },
    );

    const parsed = JSON.parse(output);
    expect(parsed.zones["maxtap.net"].errors).toHaveLength(1);
    expect(parsed.zones["maxtap.net"].errors[0].operation).toBe("create");
    expect(parsed.zones["maxtap.net"].errors[0].error).toBe("rate limited");
    expect(parsed.zones["maxtap.net"].updated).toHaveLength(1);
  });

  test("records zone-level error when inspect fails", async () => {
    const { output } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        fetchCloudflareZoneWithIds: async () => { throw new Error("auth failed"); },
      },
    );

    const parsed = JSON.parse(output);
    expect(parsed.zones["maxtap.net"].error).toContain("auth failed");
  });

  test("filters to single zone with --zone", async () => {
    let tencentCalled = false;

    await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        fetchTencentZoneWithIds: async () => { tencentCalled = true; return []; },
      },
    );

    expect(tencentCalled).toBe(false);
  });

  test("rejects --zone not in declaration", async () => {
    await expect(
      runApplyCommand(
        { command: "apply", format: "json", file: "dns/dns.yaml", zone: "unknown.com" },
        noopDeps,
      ),
    ).rejects.toThrow('Zone "unknown.com" not found in declaration file');
  });

  // --- P1: hasErrors flag ---
  test("hasErrors is false when all operations succeed", async () => {
    const { hasErrors } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml" },
      noopDeps,
    );

    expect(hasErrors).toBe(false);
  });

  test("hasErrors is true when a zone has operation errors", async () => {
    const { hasErrors } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        createCloudflareRecord: async () => { throw new Error("fail"); },
      },
    );

    expect(hasErrors).toBe(true);
  });

  test("hasErrors is true when inspect fails", async () => {
    const { hasErrors } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        fetchCloudflareZoneWithIds: async () => { throw new Error("auth failed"); },
      },
    );

    expect(hasErrors).toBe(true);
  });

  // --- P1: multi-value remote records ---
  test("skips creates when remote has multi-value records for that name:type", async () => {
    const created: string[] = [];

    const remoteWithMultiMX: CloudflareRawRecord[] = [
      { id: "mx-1", name: "maxtap.net", type: "MX", content: "mx1.example.com", ttl: 300, proxied: false },
      { id: "mx-2", name: "maxtap.net", type: "MX", content: "mx2.example.com", ttl: 300, proxied: false },
    ];

    const declWithMX: Declaration = {
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          records: [
            { name: "@", type: "MX", value: "mx1.example.com", ttl: 300 },
          ],
        },
      },
    };

    const { output } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        loadDeclaration: () => declWithMX,
        fetchCloudflareZoneWithIds: async () => remoteWithMultiMX,
        createCloudflareRecord: async ({ record }) => { created.push(`${record.name}:${record.type}`); },
      },
    );

    // Must NOT create — remote has multi-value for this name:type
    expect(created).toHaveLength(0);

    const parsed = JSON.parse(output);
    expect(parsed.zones["maxtap.net"].created).toHaveLength(0);
    expect(parsed.zones["maxtap.net"].skippedMultiValue).toHaveLength(2);
  });

  test("skips updates when remote has multi-value records for that name:type (Tencent)", async () => {
    const modified: number[] = [];

    const remoteTencentMultiMX: TencentManagedRecord[] = [
      { recordId: 201, name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600, line: "默认", updatedOn: "" },
      { recordId: 202, name: "mail", type: "MX", value: "mx2.example.com.", ttl: 600, line: "默认", updatedOn: "" },
    ];

    const declWithSingleMX: Declaration = {
      zones: {
        "ihongben.com": {
          provider: "tencent",
          records: [
            { name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600 },
          ],
        },
      },
    };

    await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "ihongben.com" },
      {
        ...noopDeps,
        loadDeclaration: () => declWithSingleMX,
        fetchTencentZoneWithIds: async () => remoteTencentMultiMX,
        modifyTencentRecord: async ({ recordId }) => { modified.push(recordId); },
      },
    );

    expect(modified).toHaveLength(0);
  });

  test("hasErrors is true when apply skips multi-value records", async () => {
    const remoteWithMultiMX: CloudflareRawRecord[] = [
      { id: "mx-1", name: "maxtap.net", type: "MX", content: "mx1.example.com", ttl: 300, proxied: false },
      { id: "mx-2", name: "maxtap.net", type: "MX", content: "mx2.example.com", ttl: 300, proxied: false },
    ];

    const declWithMX: Declaration = {
      zones: {
        "maxtap.net": {
          provider: "cloudflare",
          records: [
            { name: "@", type: "MX", value: "mx1.example.com", ttl: 300 },
          ],
        },
      },
    };

    const { hasErrors } = await runApplyCommand(
      { command: "apply", format: "json", file: "dns/dns.yaml", zone: "maxtap.net" },
      {
        ...noopDeps,
        loadDeclaration: () => declWithMX,
        fetchCloudflareZoneWithIds: async () => remoteWithMultiMX,
      },
    );

    expect(hasErrors).toBe(true);
  });
});
