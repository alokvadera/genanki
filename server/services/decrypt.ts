/**
 * Zero-knowledge run history — ported from src/convex/decryptActions.ts.
 *
 * Rows are encrypted with a key derived from the creator's IP/device token
 * (see server/encryption.ts). Decryption happens on-the-fly and only for
 * callers whose IP/device matches the creator's.
 */
import type { JobRow } from "./jobs";
import { listActiveJobsByHash, listArchivedJobsByHash } from "./jobs";
import { getJobByIdForDecrypt } from "./ipRateLimiter";
import { decrypt, hashIp } from "../encryption";
import type { CardRecord } from "../db/schema";

/** Decrypt a job row's encrypted payloads with the appropriate key seed. */
function decryptJob(job: JobRow, ip: string, deviceToken?: string): JobRow {
  const creatorDeviceIdHash = deviceToken ? hashIp(deviceToken) : undefined;
  const isDeviceCreator = Boolean(deviceToken) && job.creatorDeviceIdHash === creatorDeviceIdHash;
  const keySeed = isDeviceCreator ? deviceToken! : ip;

  return {
    ...job,
    ...(job.encDeckName !== undefined && job.encDeckName !== null
      ? { resultDeckName: decrypt(job.encDeckName, keySeed) }
      : {}),
    ...(job.encSummary !== undefined && job.encSummary !== null
      ? { resultSummary: decrypt(job.encSummary, keySeed) }
      : {}),
    ...(job.encCards !== undefined && job.encCards !== null
      ? { resultCards: JSON.parse(decrypt(job.encCards, keySeed)) as CardRecord[] }
      : {}),
    message: job.encMessage ? decrypt(job.encMessage, keySeed) : job.message,
    error: job.encError ? decrypt(job.encError, keySeed) : job.error,
  };
}

const UNAUTHORIZED_VIEW = "[Encrypted - Unauthorized Visitor]";

/** Active (queued/running) jobs visible to this visitor, decrypted. */
export async function listActiveRuns(ip: string, deviceToken?: string): Promise<JobRow[]> {
  const creatorIpHash = hashIp(ip);
  const creatorDeviceIdHash = deviceToken ? hashIp(deviceToken) : undefined;
  const jobs = await listActiveJobsByHash(creatorIpHash, creatorDeviceIdHash);
  return jobs.map((job) => decryptJob(job, ip, deviceToken));
}

/** Archived (finished) jobs visible to this visitor, decrypted. */
export async function listArchivedRuns(
  ip: string,
  limit: number | undefined,
  deviceToken?: string,
): Promise<JobRow[]> {
  const creatorIpHash = hashIp(ip);
  const creatorDeviceIdHash = deviceToken ? hashIp(deviceToken) : undefined;
  const jobs = await listArchivedJobsByHash(creatorIpHash, creatorDeviceIdHash, limit);
  return jobs.map((job) => decryptJob(job, ip, deviceToken));
}

/**
 * Single run detail, only decrypted for the creator IP or device token.
 * Unauthorized callers get metadata with redacted contents.
 */
export async function getRunDetail(
  jobId: string,
  ip: string,
  deviceToken?: string,
): Promise<JobRow | null> {
  const job = await getJobByIdForDecrypt(jobId);
  if (!job) return null;

  const creatorIpHash = hashIp(ip);
  const creatorDeviceIdHash = deviceToken ? hashIp(deviceToken) : undefined;

  const isIpCreator = job.creatorIpHash === creatorIpHash;
  const isDeviceCreator = Boolean(deviceToken) && job.creatorDeviceIdHash === creatorDeviceIdHash;

  if (!isIpCreator && !isDeviceCreator) {
    return {
      ...job,
      resultDeckName: UNAUTHORIZED_VIEW,
      resultSummary: UNAUTHORIZED_VIEW,
      resultCards: [],
      message: UNAUTHORIZED_VIEW,
      error: UNAUTHORIZED_VIEW,
    };
  }

  return decryptJob(job, ip, deviceToken);
}
