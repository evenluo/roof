import { describe, expect, test } from "bun:test";

import { formatTencentPruneSummary } from "./tencent-prune-script";
import type { TencentManagedRecord } from "./types";

describe("formatTencentPruneSummary", () => {
  test("renders keep and delete sections with record ids", () => {
    const keep: TencentManagedRecord[] = [
      {
        recordId: 202,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2026-03",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-03-14 00:11:48",
      },
    ];
    const deletes: TencentManagedRecord[] = [
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

    const output = formatTencentPruneSummary({
      zoneName: "ihongben.com",
      keep,
      deletes,
      apply: false,
    });

    expect(output).toContain("Zone: ihongben.com");
    expect(output).toContain("Mode: dry-run");
    expect(output).toContain("Keep:");
    expect(output).toContain("#202");
    expect(output).toContain("Delete:");
    expect(output).toContain("#303");
  });
});
