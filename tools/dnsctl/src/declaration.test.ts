import { describe, expect, test } from "bun:test";

import { parseDeclaration } from "./declaration";

describe("parseDeclaration", () => {
  test("parses valid declaration with both providers", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
  maxtap.net:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: auto
        proxied: true
`;

    const result = parseDeclaration(yaml);

    expect(result).toEqual({
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
    });
  });

  test("defaults proxied to false for cloudflare zones", () => {
    const yaml = `
zones:
  maxtap.net:
    provider: cloudflare
    records:
      - name: www
        type: A
        value: "1.1.1.1"
        ttl: 300
`;

    const result = parseDeclaration(yaml);

    expect(result.zones["maxtap.net"].records[0].proxied).toBe(false);
  });

  test("does not add proxied for tencent zones", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
`;

    const result = parseDeclaration(yaml);

    expect(result.zones["ihongben.com"].records[0].proxied).toBeUndefined();
  });
});

describe("parseDeclaration validation errors", () => {
  test("rejects missing zones key", () => {
    expect(() => parseDeclaration("records: []")).toThrow(
      "Declaration must have a top-level 'zones' key",
    );
  });

  test("rejects unknown provider", () => {
    const yaml = `
zones:
  example.com:
    provider: aws
    records: []
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": provider must be "cloudflare" or "tencent"',
    );
  });

  test("rejects unsupported record type", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: SRV
        value: "target"
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": record @ has unsupported type "SRV"',
    );
  });

  test("rejects proxied on tencent zone", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: 600
        proxied: true
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "ihongben.com": record @ A "proxied" is only allowed for Cloudflare zones',
    );
  });

  test("rejects ttl auto on tencent zone", () => {
    const yaml = `
zones:
  ihongben.com:
    provider: tencent
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: auto
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "ihongben.com": record @ A ttl "auto" is only allowed for Cloudflare zones',
    );
  });

  test("rejects duplicate name+type in same zone", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        value: "1.1.1.1"
        ttl: 600
      - name: "@"
        type: A
        value: "2.2.2.2"
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": duplicate record @ A',
    );
  });

  test("rejects missing record value", () => {
    const yaml = `
zones:
  example.com:
    provider: cloudflare
    records:
      - name: "@"
        type: A
        ttl: 600
`;
    expect(() => parseDeclaration(yaml)).toThrow(
      'Zone "example.com": record @ A value must be a string',
    );
  });
});
