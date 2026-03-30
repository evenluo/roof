import { createHmac, randomUUID } from "node:crypto";

import { normalizeAliyunRecord, normalizeRecordCollection } from "../normalize/records";
import type {
  AliyunManagedRecord,
  FetchLike,
  NormalizedRecord,
} from "../types";

const ALIDNS_ENDPOINT = "https://alidns.aliyuncs.com/";
const ALIDNS_VERSION = "2015-01-09";

interface AliyunDescribeResponse {
  TotalCount: number;
  PageSize: number;
  PageNumber: number;
  DomainRecords: {
    Record: Array<{
      RR: string;
      Type: string;
      Value: string;
      TTL: number;
      RecordId: string;
      Line: string;
      Status: string;
    }>;
  };
  Code?: string;
  Message?: string;
}

interface AliyunMutationResponse {
  RecordId?: string;
  RequestId?: string;
  Code?: string;
  Message?: string;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function buildSignature(
  method: string,
  params: Record<string, string>,
  accessKeySecret: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  const canonicalized = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonicalized)}`;
  const signature = createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  return signature;
}

async function callAliyunApi<T>(options: {
  accessKeyId: string;
  accessKeySecret: string;
  action: string;
  params: Record<string, string>;
  fetchImpl?: FetchLike;
}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const commonParams: Record<string, string> = {
    Format: "JSON",
    Version: ALIDNS_VERSION,
    AccessKeyId: options.accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    SignatureVersion: "1.0",
    SignatureNonce: randomUUID(),
    ...options.params,
    Action: options.action,
  };

  const signature = buildSignature("GET", commonParams, options.accessKeySecret);
  commonParams.Signature = signature;

  const query = Object.entries(commonParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const response = await fetchImpl(`${ALIDNS_ENDPOINT}?${query}`, {
    method: "GET",
  });

  const payload = (await response.json()) as T & {
    Code?: string;
    Message?: string;
  };

  if (payload.Code) {
    throw new Error(
      `Aliyun API error ${payload.Code}: ${payload.Message}`,
    );
  }

  return payload;
}

export async function inspectAliyunZone(options: {
  accessKeyId: string;
  accessKeySecret: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<NormalizedRecord[]> {
  const records: Array<{ RR: string; Type: string; Value: string; TTL: number }> = [];
  let pageNumber = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (records.length < totalCount) {
    const payload = await callAliyunApi<AliyunDescribeResponse>({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      action: "DescribeDomainRecords",
      params: {
        DomainName: options.zoneName,
        PageNumber: String(pageNumber),
        PageSize: "500",
      },
      fetchImpl: options.fetchImpl,
    });

    totalCount = payload.TotalCount;
    records.push(...payload.DomainRecords.Record);
    pageNumber += 1;
  }

  return normalizeRecordCollection(records.map(normalizeAliyunRecord));
}

export async function fetchAliyunZoneWithIds(options: {
  accessKeyId: string;
  accessKeySecret: string;
  zoneName: string;
  fetchImpl?: FetchLike;
}): Promise<AliyunManagedRecord[]> {
  const records: AliyunManagedRecord[] = [];
  let pageNumber = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (records.length < totalCount) {
    const payload = await callAliyunApi<AliyunDescribeResponse>({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      action: "DescribeDomainRecords",
      params: {
        DomainName: options.zoneName,
        PageNumber: String(pageNumber),
        PageSize: "500",
      },
      fetchImpl: options.fetchImpl,
    });

    totalCount = payload.TotalCount;
    records.push(
      ...payload.DomainRecords.Record.map((r) => ({
        recordId: r.RecordId,
        name: r.RR,
        type: r.Type,
        value: r.Value,
        ttl: r.TTL,
        line: r.Line,
      })),
    );
    pageNumber += 1;
  }

  return records;
}

export async function createAliyunRecord(options: {
  accessKeyId: string;
  accessKeySecret: string;
  zoneName: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callAliyunApi<AliyunMutationResponse>({
    accessKeyId: options.accessKeyId,
    accessKeySecret: options.accessKeySecret,
    action: "AddDomainRecord",
    params: {
      DomainName: options.zoneName,
      RR: options.record.name === "@" ? "@" : options.record.name,
      Type: options.record.type,
      Value: options.record.value,
      TTL: String(options.record.ttl === "auto" ? 600 : options.record.ttl),
    },
    fetchImpl: options.fetchImpl,
  });
}

export async function updateAliyunRecord(options: {
  accessKeyId: string;
  accessKeySecret: string;
  recordId: string;
  record: NormalizedRecord;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callAliyunApi<AliyunMutationResponse>({
    accessKeyId: options.accessKeyId,
    accessKeySecret: options.accessKeySecret,
    action: "UpdateDomainRecord",
    params: {
      RecordId: options.recordId,
      RR: options.record.name === "@" ? "@" : options.record.name,
      Type: options.record.type,
      Value: options.record.value,
      TTL: String(options.record.ttl === "auto" ? 600 : options.record.ttl),
    },
    fetchImpl: options.fetchImpl,
  });
}

export async function deleteAliyunRecord(options: {
  accessKeyId: string;
  accessKeySecret: string;
  recordId: string;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await callAliyunApi<AliyunMutationResponse>({
    accessKeyId: options.accessKeyId,
    accessKeySecret: options.accessKeySecret,
    action: "DeleteDomainRecord",
    params: {
      RecordId: options.recordId,
    },
    fetchImpl: options.fetchImpl,
  });
}
