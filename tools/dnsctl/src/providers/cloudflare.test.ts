import { describe, expect, test } from "bun:test";

import type { FetchLike } from "../types";

import {
  createCloudflareRecord,
  deleteCloudflareRecord,
  fetchCloudflareZoneWithIds,
  inspectCloudflareZone,
  updateCloudflareRecord,
} from "./cloudflare";

describe("inspectCloudflareZone", () => {
  test("looks up zone id, paginates records, and preserves proxied", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const fetchImpl: FetchLike = async (input, init) => {
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

function makeZoneFetch(zoneId: string, zoneName: string): FetchLike {
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/zones?name=")) {
      return new Response(
        JSON.stringify({ success: true, result: [{ id: zoneId, name: zoneName }] }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

describe("fetchCloudflareZoneWithIds", () => {
  test("returns records with their remote IDs", async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }

      if (url.includes("/dns_records?page=1")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: [
              { id: "rec-1", name: "maxtap.net", type: "A", content: "1.2.3.4", ttl: 1, proxied: false },
              { id: "rec-2", name: "www.maxtap.net", type: "CNAME", content: "example.com", ttl: 300, proxied: false },
            ],
            result_info: { page: 1, total_pages: 1 },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const records = await fetchCloudflareZoneWithIds({
      apiToken: "tok",
      zoneName: "maxtap.net",
      fetchImpl,
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ id: "rec-1", name: "maxtap.net", type: "A" });
    expect(records[1]).toMatchObject({ id: "rec-2", name: "www.maxtap.net", type: "CNAME" });
  });
});

describe("createCloudflareRecord", () => {
  test("posts denormalized record to zone", async () => {
    let capturedBody: unknown;
    let capturedUrl = "";

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }

      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, result: { id: "new-rec" } }), { status: 200 });
    };

    await createCloudflareRecord({
      apiToken: "tok",
      zoneName: "maxtap.net",
      record: { name: "www", type: "A", value: "1.2.3.4", ttl: 300, proxied: false },
      fetchImpl,
    });

    expect(capturedUrl).toBe("https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records");
    expect(capturedBody).toMatchObject({
      name: "www.maxtap.net",
      type: "A",
      content: "1.2.3.4",
      ttl: 300,
      proxied: false,
    });
  });

  test("denormalizes @ to zone apex", async () => {
    let capturedBody: unknown;

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, result: { id: "new-rec" } }), { status: 200 });
    };

    await createCloudflareRecord({
      apiToken: "tok",
      zoneName: "maxtap.net",
      record: { name: "@", type: "A", value: "1.2.3.4", ttl: 300 },
      fetchImpl,
    });

    expect((capturedBody as Record<string, unknown>).name).toBe("maxtap.net");
  });
});

describe("createCloudflareRecord proxied TTL", () => {
  test("forces ttl=1 when proxied is true regardless of declared ttl", async () => {
    let capturedBody: unknown;

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, result: { id: "new-rec" } }), { status: 200 });
    };

    await createCloudflareRecord({
      apiToken: "tok",
      zoneName: "maxtap.net",
      record: { name: "@", type: "A", value: "1.2.3.4", ttl: 300, proxied: true },
      fetchImpl,
    });

    expect((capturedBody as Record<string, unknown>).ttl).toBe(1);
  });
});

describe("updateCloudflareRecord", () => {
  test("patches the record by id", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: unknown;

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    };

    await updateCloudflareRecord({
      apiToken: "tok",
      zoneName: "maxtap.net",
      recordId: "rec-99",
      record: { name: "www", type: "A", value: "5.6.7.8", ttl: 120, proxied: true },
      fetchImpl,
    });

    expect(capturedUrl).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records/rec-99",
    );
    expect(capturedMethod).toBe("PATCH");
    expect(capturedBody).toMatchObject({
      name: "www.maxtap.net",
      type: "A",
      content: "5.6.7.8",
      ttl: 1,       // proxied=true forces Auto TTL
      proxied: true,
    });
  });
});

describe("deleteCloudflareRecord", () => {
  test("sends DELETE request to record endpoint", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    const fetchImpl: FetchLike = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/zones?name=")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "zone-abc", name: "maxtap.net" }] }),
          { status: 200 },
        );
      }
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      return new Response(JSON.stringify({ success: true, result: { id: "rec-99" } }), { status: 200 });
    };

    await deleteCloudflareRecord({
      apiToken: "tok",
      zoneName: "maxtap.net",
      recordId: "rec-99",
      fetchImpl,
    });

    expect(capturedUrl).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records/rec-99",
    );
    expect(capturedMethod).toBe("DELETE");
  });
});
