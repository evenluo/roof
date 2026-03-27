import { describe, expect, test } from "bun:test";

import { inspectCloudflareZone } from "./cloudflare";

describe("inspectCloudflareZone", () => {
  test("looks up zone id, paginates records, and preserves proxied", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({ url, init });

      if (url === "https://api.cloudflare.com/client/v4/zones?name=maxtap.net") {
        return new Response(
          JSON.stringify({
            success: true,
            result: [{ id: "zone-123", name: "maxtap.net" }],
          }),
          { status: 200 },
        );
      }

      if (
        url ===
        "https://api.cloudflare.com/client/v4/zones/zone-123/dns_records?page=1&per_page=100"
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                name: "maxtap.net",
                type: "A",
                content: "1.1.1.1",
                ttl: 1,
                proxied: true,
              },
            ],
            result_info: { page: 1, total_pages: 2 },
          }),
          { status: 200 },
        );
      }

      if (
        url ===
        "https://api.cloudflare.com/client/v4/zones/zone-123/dns_records?page=2&per_page=100"
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                name: "www.maxtap.net",
                type: "CNAME",
                content: "example.pages.dev",
                ttl: 300,
                proxied: false,
              },
            ],
            result_info: { page: 2, total_pages: 2 },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const records = await inspectCloudflareZone({
      apiToken: "cf-token",
      zoneName: "maxtap.net",
      fetchImpl,
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: "Bearer cf-token",
    });
    expect(records).toEqual([
      {
        name: "@",
        type: "A",
        value: "1.1.1.1",
        ttl: "auto",
        proxied: true,
      },
      {
        name: "www",
        type: "CNAME",
        value: "example.pages.dev",
        ttl: 300,
        proxied: false,
      },
    ]);
  });
});

