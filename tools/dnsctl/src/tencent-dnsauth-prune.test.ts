import { describe, expect, test } from "bun:test";

import { buildDnsauthPrunePlan } from "./tencent-dnsauth-prune";
import type { TencentManagedRecord } from "./types";

describe("buildDnsauthPrunePlan", () => {
  test("keeps the most recently updated _dnsauth TXT record and deletes the rest", () => {
    const records: TencentManagedRecord[] = [
      {
        recordId: 101,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2025",
        ttl: 600,
        line: "默认",
        updatedOn: "2025-01-17 07:12:17",
      },
      {
        recordId: 202,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2026-03",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-03-14 00:11:48",
      },
      {
        recordId: 303,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2026-01",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-01-13 00:22:28",
      },
    ];

    const plan = buildDnsauthPrunePlan(records);

    expect(plan.keep).toEqual([
      {
        recordId: 202,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2026-03",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-03-14 00:11:48",
      },
    ]);
    expect(plan.delete).toEqual([
      {
        recordId: 303,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2026-01",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-01-13 00:22:28",
      },
      {
        recordId: 101,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2025",
        ttl: 600,
        line: "默认",
        updatedOn: "2025-01-17 07:12:17",
      },
    ]);
  });

  test("throws when there is no _dnsauth TXT record to prune", () => {
    expect(() => buildDnsauthPrunePlan([])).toThrow(
      'No matching "_dnsauth" TXT records found',
    );
  });
});
