import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { FetchLike } from "../types";

import { deleteTencentRecord, inspectTencentZone, listTencentManagedRecords } from "./tencent";

const originalDateNow = Date.now;

describe("inspectTencentZone", () => {
  beforeEach(() => {
    Date.now = mock(() => 1710000000000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  test("calls DNSPod API 3.0, paginates records, and filters non-default lines", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({ url, init });

      const action = new Headers(init?.headers).get("X-TC-Action");
      const body = JSON.parse(String(init?.body));

      if (action === "DescribeRecordList" && body.Offset === 0) {
        return new Response(
          JSON.stringify({
            Response: {
              RecordCountInfo: {
                SubdomainCount: 3,
                TotalCount: 3,
                ListCount: 2,
              },
              RecordList: [
                {
                  Name: "@",
                  Type: "A",
                  Value: "2.2.2.2",
                  TTL: 600,
                  Line: "默认",
                },
                {
                  Name: "mail",
                  Type: "MX",
                  Value: "mail.example.com.",
                  TTL: 600,
                  Line: "默认",
                },
              ],
              RequestId: "req-1",
            },
          }),
          { status: 200 },
        );
      }

      if (action === "DescribeRecordList" && body.Offset === 2) {
        return new Response(
          JSON.stringify({
            Response: {
              RecordCountInfo: {
                SubdomainCount: 3,
                TotalCount: 3,
                ListCount: 1,
              },
              RecordList: [
                {
                  Name: "cdn",
                  Type: "CNAME",
                  Value: "edge.example.com.",
                  TTL: 600,
                  Line: "境外",
                },
              ],
              RequestId: "req-2",
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected request: ${action} ${JSON.stringify(body)}`);
    };

    const records = await inspectTencentZone({
      secretId: "secret-id",
      secretKey: "secret-key",
      zoneName: "ihongben.com",
      fetchImpl,
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("https://dnspod.tencentcloudapi.com/");
    expect(new Headers(requests[0]?.init?.headers).get("X-TC-Action")).toBe(
      "DescribeRecordList",
    );
    expect(new Headers(requests[0]?.init?.headers).get("X-TC-Version")).toBe(
      "2021-03-23",
    );
    expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toStartWith(
      "TC3-HMAC-SHA256 Credential=secret-id/",
    );
    expect(records).toEqual([
      {
        name: "@",
        type: "A",
        value: "2.2.2.2",
        ttl: 600,
      },
      {
        name: "mail",
        type: "MX",
        value: "mail.example.com.",
        ttl: 600,
      },
    ]);
  });

  test("surfaces Tencent API errors from the response body", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          Response: {
            Error: {
              Code: "AuthFailure.UnauthorizedOperation",
              Message: "missing permission",
            },
            RequestId: "req-error",
          },
        }),
        { status: 200 },
      );

    await expect(
      inspectTencentZone({
        secretId: "secret-id",
        secretKey: "secret-key",
        zoneName: "ihongben.com",
        fetchImpl,
      }),
    ).rejects.toThrow(
      "Tencent API error AuthFailure.UnauthorizedOperation: missing permission",
    );
  });

  test("lists managed records with record ids and update time", async () => {
    const fetchImpl: FetchLike = async (_input, init) => {
      const action = new Headers(init?.headers).get("X-TC-Action");
      const body = JSON.parse(String(init?.body));

      if (action !== "DescribeRecordList") {
        throw new Error(`Unexpected action: ${action}`);
      }

      expect(body.Subdomain).toBe("_dnsauth");
      expect(body.RecordType).toBe("TXT");
      expect(body.SortField).toBe("updated_on");
      expect(body.SortType).toBe("DESC");

      return new Response(
        JSON.stringify({
          Response: {
            RecordCountInfo: {
              SubdomainCount: 2,
              TotalCount: 2,
              ListCount: 2,
            },
            RecordList: [
              {
                RecordId: 202,
                Name: "_dnsauth",
                Type: "TXT",
                Value: "token-2",
                TTL: 600,
                Line: "默认",
                UpdatedOn: "2026-03-14 00:11:48",
              },
              {
                RecordId: 101,
                Name: "_dnsauth",
                Type: "TXT",
                Value: "token-1",
                TTL: 600,
                Line: "默认",
                UpdatedOn: "2026-01-13 00:22:28",
              },
            ],
            RequestId: "req-list",
          },
        }),
        { status: 200 },
      );
    };

    const records = await listTencentManagedRecords({
      secretId: "secret-id",
      secretKey: "secret-key",
      zoneName: "ihongben.com",
      subdomain: "_dnsauth",
      recordType: "TXT",
      fetchImpl,
    });

    expect(records).toEqual([
      {
        recordId: 202,
        name: "_dnsauth",
        type: "TXT",
        value: "token-2",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-03-14 00:11:48",
      },
      {
        recordId: 101,
        name: "_dnsauth",
        type: "TXT",
        value: "token-1",
        ttl: 600,
        line: "默认",
        updatedOn: "2026-01-13 00:22:28",
      },
    ]);
  });

  test("deletes a record by record id", async () => {
    const requests: Array<{ action: string | null; body: Record<string, unknown> }> = [];

    const fetchImpl: FetchLike = async (_input, init) => {
      const action = new Headers(init?.headers).get("X-TC-Action");
      const body = JSON.parse(String(init?.body));
      requests.push({ action, body });

      return new Response(
        JSON.stringify({
          Response: {
            RequestId: "req-delete",
          },
        }),
        { status: 200 },
      );
    };

    await deleteTencentRecord({
      secretId: "secret-id",
      secretKey: "secret-key",
      zoneName: "ihongben.com",
      recordId: 202,
      fetchImpl,
    });

    expect(requests).toEqual([
      {
        action: "DeleteRecord",
        body: {
          Domain: "ihongben.com",
          RecordId: 202,
        },
      },
    ]);
  });
});
