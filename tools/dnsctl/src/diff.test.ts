import { describe, expect, test } from "bun:test";

import { computeZoneDiff } from "./diff";
import type { NormalizedRecord } from "./types";

describe("computeZoneDiff", () => {
  test("detects records to create", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "blog", type: "A", value: "2.2.2.2", ttl: 300 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([
      { name: "blog", type: "A", value: "2.2.2.2", ttl: 300 },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  test("detects records to delete", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "old", type: "CNAME", value: "legacy.example.com", ttl: 300 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([
      { name: "old", type: "CNAME", value: "legacy.example.com", ttl: 300 },
    ]);
  });

  test("detects records to update", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "2.2.2.2", ttl: "auto", proxied: true },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600, proxied: false },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          value: { from: "1.1.1.1", to: "2.2.2.2" },
          ttl: { from: 600, to: "auto" },
          proxied: { from: false, to: true },
        },
      },
    ]);
    expect(result.deletes).toEqual([]);
  });

  test("returns empty diff when records match", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("computeZoneDiff type filtering", () => {
  test("ignores unsupported record types from remote", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "@", type: "NS", value: "ns1.example.com", ttl: 86400 },
      { name: "@", type: "SOA", value: "ns1.example.com admin.example.com", ttl: 3600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  test("only deletes supported types from remote", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "@", type: "CAA", value: '0 issue "letsencrypt.org"', ttl: 3600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.deletes).toEqual([
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ]);
  });
});

describe("computeZoneDiff remote duplicates", () => {
  test("throws on duplicate name+type in remote after filtering", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "mail", type: "MX", value: "mx1.example.com.", ttl: 600 },
      { name: "mail", type: "MX", value: "mx2.example.com.", ttl: 600 },
    ];

    expect(() => computeZoneDiff(declared, remote)).toThrow(
      "Duplicate name+type in remote records: mail MX (2 records)",
    );
  });

  test("does not throw when duplicates are in unsupported types only", () => {
    const declared: NormalizedRecord[] = [];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "NS", value: "ns1.example.com", ttl: 86400 },
      { name: "@", type: "NS", value: "ns2.example.com", ttl: 86400 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("computeZoneDiff proxied comparison", () => {
  test("detects proxied change", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: true },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: "auto", proxied: false },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.updates).toEqual([
      {
        name: "@",
        type: "A",
        changes: {
          proxied: { from: false, to: true },
        },
      },
    ]);
  });

  test("treats missing proxied as false on both sides", () => {
    const declared: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];
    const remote: NormalizedRecord[] = [
      { name: "@", type: "A", value: "1.1.1.1", ttl: 600 },
    ];

    const result = computeZoneDiff(declared, remote);

    expect(result.updates).toEqual([]);
  });
});
