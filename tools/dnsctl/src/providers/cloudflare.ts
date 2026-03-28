import { denormalizeRecordName, normalizeCloudflareRecord, normalizeRecordCollection } from "../normalize/records";
import type { CloudflareRecord, FetchLike, NormalizedRecord } from "../types";

export interface CloudflareRawRecord extends CloudflareRecord {
  id: string;
}

interface CloudflareZoneLookupResponse {
  success: boolean;
  result: Array<{ id: string; name: string }>;
}

interface CloudflareDnsRecordsResponse {
  success: boolean;
  result: CloudflareRawRecord[];
  result_info: {
    page: number;
    total_pages: number;
  };
}

async function resolveCloudflareZoneId(options: {
  apiToken: string;
  zoneName: string;
  fetchImpl: FetchLike;
}): Promise<string> {
  const zoneResponse = await options.fetchImpl(
    `https://api.cloudflare.com/client/v4/zones?name=${options.zoneName}`,
    { headers: { Authorization: `Bearer ${options.apiToken}` } },
  );
  const zonePayload = (await zoneResponse.json()) as CloudflareZoneLookupResponse;
  const zoneId = zonePayload.result[0]?.id;

  if (!zoneResponse.ok || !zonePayload.success || !zoneId) {
    throw new Error(`Failed to resolve Cloudflare zone: ${options.zoneName}`);
  }

  return zoneId;
}

export async function fetchCloudflareZoneWithIds(options: {
  apiToken: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<CloudflareRawRecord[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${options.apiToken}` };

  const zoneId = await resolveCloudflareZoneId({
    apiToken: options.apiToken,
    zoneName: options.zoneName,
    fetchImpl,
  });

  const records: CloudflareRawRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const recordsResponse = await fetchImpl(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?page=${page}&per_page=100`,
      { headers },
    );
    const recordsPayload = (await recordsResponse.json()) as CloudflareDnsRecordsResponse;

    if (!recordsResponse.ok || !recordsPayload.success) {
      throw new Error(`Failed to list Cloudflare DNS records: ${options.zoneName}`);
    }

    records.push(...recordsPayload.result);
    totalPages = recordsPayload.result_info.total_pages;
    page += 1;
  }

  return records;
}

export async function inspectCloudflareZone(options: {
  apiToken: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<NormalizedRecord[]> {
  const rawRecords = await fetchCloudflareZoneWithIds(options);
  return normalizeRecordCollection(
    rawRecords.map((record) => normalizeCloudflareRecord(options.zoneName, record)),
  );
}

export async function createCloudflareRecord(options: {
  apiToken: string;
  zoneName: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const zoneId = await resolveCloudflareZoneId({
    apiToken: options.apiToken,
    zoneName: options.zoneName,
    fetchImpl,
  });

  const proxied = options.record.proxied ?? false;
  const body = {
    name: denormalizeRecordName(options.zoneName, options.record.name),
    type: options.record.type,
    content: options.record.value,
    ttl: (proxied || options.record.ttl === "auto") ? 1 : options.record.ttl,
    proxied,
  };

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create Cloudflare record ${options.record.name} ${options.record.type}`);
  }
}

export async function updateCloudflareRecord(options: {
  apiToken: string;
  zoneName: string;
  recordId: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const zoneId = await resolveCloudflareZoneId({
    apiToken: options.apiToken,
    zoneName: options.zoneName,
    fetchImpl,
  });

  const proxied = options.record.proxied ?? false;
  const body = {
    name: denormalizeRecordName(options.zoneName, options.record.name),
    type: options.record.type,
    content: options.record.value,
    ttl: (proxied || options.record.ttl === "auto") ? 1 : options.record.ttl,
    proxied,
  };

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${options.recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update Cloudflare record ${options.record.name} ${options.record.type}`);
  }
}

export async function deleteCloudflareRecord(options: {
  apiToken: string;
  zoneName: string;
  recordId: string;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const zoneId = await resolveCloudflareZoneId({
    apiToken: options.apiToken,
    zoneName: options.zoneName,
    fetchImpl,
  });

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${options.recordId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${options.apiToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete Cloudflare record ${options.recordId}`);
  }
}
