import { describe, expect, test } from "bun:test";

import {
  normalizeCloudflareRecord,
  normalizeRecordCollection,
  normalizeTencentRecord,
} from "./records";

describe("normalizeCloudflareRecord", () => {
  test("converts root name and automatic ttl", () => {
    const record = normalizeCloudflareRecord("maxtap.net", {
      name: "maxtap.net",
      type: "A",
      content: "1.2.3.4",
      ttl: 1,
      proxied: true,
    });

    expect(record).toEqual({
      name: "@",
      type: "A",
      value: "1.2.3.4",
      ttl: "auto",
      proxied: true,
    });
  });

  test("converts subdomain name to relative host", () => {
    const record = normalizeCloudflareRecord("maxtap.net", {
      name: "blog.maxtap.net",
      type: "CNAME",
      content: "example.pages.dev",
      ttl: 300,
      proxied: false,
    });

    expect(record).toEqual({
      name: "blog",
      type: "CNAME",
      value: "example.pages.dev",
      ttl: 300,
      proxied: false,
    });
  });
});

describe("normalizeTencentRecord", () => {
  test("preserves non-primary record types", () => {
    const record = normalizeTencentRecord({
      Name: "mail",
      Type: "MX",
      Value: "mail.example.com.",
      TTL: 600,
    });

    expect(record).toEqual({
      name: "mail",
      type: "MX",
      value: "mail.example.com.",
      ttl: 600,
    });
  });
});

describe("normalizeRecordCollection", () => {
  test("sorts records by name, type, value", () => {
    const records = normalizeRecordCollection([
      { name: "www", type: "CNAME", value: "b.example.com", ttl: 600 },
      { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
      { name: "www", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "www", type: "CNAME", value: "a.example.com", ttl: 600 },
    ]);

    expect(records).toEqual([
      { name: "@", type: "A", value: "2.2.2.2", ttl: 600 },
      { name: "www", type: "A", value: "1.1.1.1", ttl: 600 },
      { name: "www", type: "CNAME", value: "a.example.com", ttl: 600 },
      { name: "www", type: "CNAME", value: "b.example.com", ttl: 600 },
    ]);
  });
});
