import { createHash, createHmac } from "node:crypto";

import { normalizeRecordCollection, normalizeTencentRecord } from "../normalize/records";
import type {
  FetchLike,
  NormalizedRecord,
  TencentManagedRecord,
  TencentRecord,
} from "../types";

const DNSPOD_ENDPOINT = "https://dnspod.tencentcloudapi.com/";
const DNSPOD_HOST = "dnspod.tencentcloudapi.com";
const DNSPOD_SERVICE = "dnspod";
const DNSPOD_VERSION = "2021-03-23";
const DEFAULT_LINE_NAMES = new Set(["默认", "Default", "default", ""]);

interface TencentRecordListResponse {
  Response: {
    Error?: {
      Code: string;
      Message: string;
    };
    RecordCountInfo: {
      TotalCount: number;
      ListCount: number;
    };
    RecordList: Array<TencentRecord & { Line?: string }>;
    RequestId: string;
  };
}

interface TencentManagedRecordListResponse {
  Response: {
    Error?: {
      Code: string;
      Message: string;
    };
    RecordCountInfo: {
      TotalCount: number;
      ListCount: number;
    };
    RecordList: Array<
      TencentRecord & {
        RecordId: number;
        Line?: string;
        UpdatedOn: string;
      }
    >;
    RequestId: string;
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hmacSha256(key: Buffer | string, content: string): Buffer {
  return createHmac("sha256", key).update(content).digest();
}

function buildAuthorization(options: {
  secretId: string;
  secretKey: string;
  action: string;
  payload: string;
  timestamp: number;
}): string {
  const date = new Date(options.timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${DNSPOD_HOST}\n`;
  const signedHeaders = "content-type;host";
  const hashedRequestPayload = sha256(options.payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join("\n");

  const credentialScope = `${date}/${DNSPOD_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(options.timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const secretDate = hmacSha256(`TC3${options.secretKey}`, date);
  const secretService = hmacSha256(secretDate, DNSPOD_SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign)
    .digest("hex");

  return `TC3-HMAC-SHA256 Credential=${options.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function callTencentApi<ResponsePayload>(options: {
  secretId: string;
  secretKey: string;
  action: string;
  body: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<ResponsePayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timestamp = Math.floor(Date.now() / 1000);
  const requestPayload = JSON.stringify(options.body);

  const response = await fetchImpl(DNSPOD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: buildAuthorization({
        secretId: options.secretId,
        secretKey: options.secretKey,
        action: options.action,
        payload: requestPayload,
        timestamp,
      }),
      "Content-Type": "application/json; charset=utf-8",
      Host: DNSPOD_HOST,
      "X-TC-Action": options.action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": DNSPOD_VERSION,
    },
    body: requestPayload,
  });

  if (!response.ok) {
    throw new Error(`Tencent API request failed: ${options.action}`);
  }

  const responsePayload = (await response.json()) as ResponsePayload & {
    Response?: {
      Error?: {
        Code: string;
        Message: string;
      };
    };
  };

  const apiError = responsePayload.Response?.Error;
  if (apiError) {
    throw new Error(
      `Tencent API error ${apiError.Code}: ${apiError.Message}`,
    );
  }

  return responsePayload;
}

export async function listTencentManagedRecords(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  subdomain: string;
  recordType: string;
  fetchImpl?: FetchLike;
}): Promise<TencentManagedRecord[]> {
  const records: TencentManagedRecord[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const payload = await callTencentApi<TencentManagedRecordListResponse>({
      secretId: options.secretId,
      secretKey: options.secretKey,
      action: "DescribeRecordList",
      body: {
        Domain: options.zoneName,
        Subdomain: options.subdomain,
        RecordType: options.recordType,
        Offset: offset,
        Limit: 100,
        SortField: "updated_on",
        SortType: "DESC",
      },
      fetchImpl: options.fetchImpl,
    });

    records.push(
      ...payload.Response.RecordList.filter((record) =>
        DEFAULT_LINE_NAMES.has(record.Line ?? ""),
      ).map((record) => ({
        recordId: record.RecordId,
        name: record.Name,
        type: record.Type,
        value: record.Value,
        ttl: record.TTL,
        line: record.Line ?? "",
        updatedOn: record.UpdatedOn,
      })),
    );

    totalCount = payload.Response.RecordCountInfo.TotalCount;
    offset += payload.Response.RecordCountInfo.ListCount;
  }

  return records;
}

export async function deleteTencentRecord(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  recordId: number;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callTencentApi({
    secretId: options.secretId,
    secretKey: options.secretKey,
    action: "DeleteRecord",
    body: {
      Domain: options.zoneName,
      RecordId: options.recordId,
    },
    fetchImpl: options.fetchImpl,
  });
}

export async function fetchTencentZoneWithIds(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<TencentManagedRecord[]> {
  const records: TencentManagedRecord[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const payload = await callTencentApi<TencentManagedRecordListResponse>({
      secretId: options.secretId,
      secretKey: options.secretKey,
      action: "DescribeRecordList",
      body: {
        Domain: options.zoneName,
        Offset: offset,
        Limit: 100,
      },
      fetchImpl: options.fetchImpl,
    });

    records.push(
      ...payload.Response.RecordList.filter((record) =>
        DEFAULT_LINE_NAMES.has(record.Line ?? ""),
      ).map((record) => ({
        recordId: record.RecordId,
        name: record.Name,
        type: record.Type,
        value: record.Value,
        ttl: record.TTL,
        line: record.Line ?? "",
        updatedOn: record.UpdatedOn,
      })),
    );

    totalCount = payload.Response.RecordCountInfo.TotalCount;
    offset += payload.Response.RecordCountInfo.ListCount;
  }

  return records;
}

export async function createTencentRecord(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callTencentApi({
    secretId: options.secretId,
    secretKey: options.secretKey,
    action: "CreateRecord",
    body: {
      Domain: options.zoneName,
      SubDomain: options.record.name,
      RecordType: options.record.type,
      Value: options.record.value,
      TTL: options.record.ttl,
      RecordLine: "默认",
    },
    fetchImpl: options.fetchImpl,
  });
}

export async function modifyTencentRecord(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  recordId: number;
  line: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callTencentApi({
    secretId: options.secretId,
    secretKey: options.secretKey,
    action: "ModifyRecord",
    body: {
      Domain: options.zoneName,
      RecordId: options.recordId,
      SubDomain: options.record.name,
      RecordType: options.record.type,
      Value: options.record.value,
      TTL: options.record.ttl,
      RecordLine: options.line,
    },
    fetchImpl: options.fetchImpl,
  });
}

export async function inspectTencentZone(options: {
  secretId: string;
  secretKey: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<NormalizedRecord[]> {
  const records: TencentRecord[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const payload = await callTencentApi<TencentRecordListResponse>({
      secretId: options.secretId,
      secretKey: options.secretKey,
      action: "DescribeRecordList",
      body: {
        Domain: options.zoneName,
        Offset: offset,
        Limit: 100,
      },
      fetchImpl: options.fetchImpl,
    });

    const list = payload.Response.RecordList.filter((record) =>
      DEFAULT_LINE_NAMES.has(record.Line ?? ""),
    );
    records.push(...list);

    totalCount = payload.Response.RecordCountInfo.TotalCount;
    offset += payload.Response.RecordCountInfo.ListCount;
  }

  return normalizeRecordCollection(records.map(normalizeTencentRecord));
}
