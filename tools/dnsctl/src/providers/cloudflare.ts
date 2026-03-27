import { normalizeCloudflareRecord, normalizeRecordCollection } from "../normalize/records";
import type { CloudflareRecord, NormalizedRecord } from "../types";

interface CloudflareZoneLookupResponse {
  success: boolean;
  result: Array<{ id: string; name: string }>;
}

interface CloudflareDnsRecordsResponse {
  success: boolean;
  result: CloudflareRecord[];
  result_info: {
    page: number;
    total_pages: number;
  };
}

export async function inspectCloudflareZone(options: {
  apiToken: string;
  zoneName: string;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedRecord[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.apiToken}`,
  };

  const zoneResponse = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones?name=${options.zoneName}`,
    { headers },
  );
  const zonePayload = (await zoneResponse.json()) as CloudflareZoneLookupResponse;
  const zoneId = zonePayload.result[0]?.id;

  if (!zoneResponse.ok || !zonePayload.success || !zoneId) {
    throw new Error(`Failed to resolve Cloudflare zone: ${options.zoneName}`);
  }

  const records: CloudflareRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const recordsResponse = await fetchImpl(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?page=${page}&per_page=100`,
      { headers },
    );
    const recordsPayload =
      (await recordsResponse.json()) as CloudflareDnsRecordsResponse;

    if (!recordsResponse.ok || !recordsPayload.success) {
      throw new Error(`Failed to list Cloudflare DNS records: ${options.zoneName}`);
    }

    records.push(...recordsPayload.result);
    totalPages = recordsPayload.result_info.total_pages;
    page += 1;
  }

  return normalizeRecordCollection(
    records.map((record) => normalizeCloudflareRecord(options.zoneName, record)),
  );
}

