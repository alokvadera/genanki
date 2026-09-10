/**
 * Generation jobs data layer — ported from src/convex/generationJobs.ts.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { generationJobs } from "../db/schema";
import type { CardRecord, TrailRecord } from "../db/schema";

export type JobStatus = "queued" | "running" | "succeeded" | "canceled" | "failed";

export type JobRow = typeof generationJobs.$inferSelect;

export type CreateJobInput = {
  kind: "prompt" | "document";
  requestedCount: number;
  totalProviders: number;
  totalModels: number;
  totalSections: number;
  message: string;
  etaSeconds: number;
  timeoutSeconds: number;
  deadlineAt: number;
};

export async function createJob(args: CreateJobInput): Promise<string> {
  const now = Date.now();
  const [row] = await db
    .insert(generationJobs)
    .values({
      kind: args.kind,
      status: "queued",
      requestedCount: args.requestedCount,
      progress: 0,
      etaSeconds: args.etaSeconds,
      timeoutSeconds: args.timeoutSeconds,
      deadlineAt: args.deadlineAt,
      message: args.message,
      providerIndex: 0,
      modelIndex: 0,
      totalProviders: args.totalProviders,
      totalModels: args.totalModels,
      sectionIndex: 0,
      totalSections: args.totalSections,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: generationJobs.id });
  return row!.id;
}

/** The subset of job fields that callers may patch. */
export type JobPatch = Partial<Omit<JobRow, "id" | "createdAt" | "creationTime">>;

export async function updateJobRow(jobId: string, patch: JobPatch): Promise<void> {
  await db
    .update(generationJobs)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(generationJobs.id, jobId));
}

export async function cancelJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const now = Date.now();
  await db
    .update(generationJobs)
    .set({
      status: job.status === "succeeded" ? "succeeded" : "canceled",
      cancelRequestedAt: now,
      canceledAt: now,
      updatedAt: now,
      message: job.status === "succeeded" ? job.message : "Generation canceled",
    })
    .where(eq(generationJobs.id, jobId));
}

export async function getJob(jobId: string): Promise<JobRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return null;
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

/** List active jobs created by the given IP/device hashes (server-side only). */
export async function listActiveJobsByHash(
  creatorIpHash: string,
  creatorDeviceIdHash?: string,
): Promise<JobRow[]> {
  const ipRows = await db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.creatorIpHash, creatorIpHash),
        inArray(generationJobs.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(generationJobs.createdAt))
    .limit(100);

  let deviceRows: JobRow[] = [];
  if (creatorDeviceIdHash) {
    deviceRows = await db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.creatorDeviceIdHash, creatorDeviceIdHash),
          inArray(generationJobs.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(generationJobs.createdAt))
      .limit(100);
  }

  const merged = new Map<string, JobRow>();
  for (const row of [...ipRows, ...deviceRows]) merged.set(row.id, row);
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** List archived (finished) jobs created by the given IP/device hashes. */
export async function listArchivedJobsByHash(
  creatorIpHash: string,
  creatorDeviceIdHash: string | undefined,
  limit = 50,
): Promise<JobRow[]> {
  const cap = Math.min(100, Math.max(1, Math.round(limit)));
  const ipRows = await db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.creatorIpHash, creatorIpHash),
        inArray(generationJobs.status, ["succeeded", "canceled", "failed"]),
      ),
    )
    .orderBy(desc(generationJobs.createdAt))
    .limit(cap * 3);

  let deviceRows: JobRow[] = [];
  if (creatorDeviceIdHash) {
    deviceRows = await db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.creatorDeviceIdHash, creatorDeviceIdHash),
          inArray(generationJobs.status, ["succeeded", "canceled", "failed"]),
        ),
      )
      .orderBy(desc(generationJobs.createdAt))
      .limit(cap * 3);
  }

  const merged = new Map<string, JobRow>();
  for (const row of [...ipRows, ...deviceRows]) merged.set(row.id, row);
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
}

/** Opportunistic cleanup: delete jobs older than the retention window. */
export async function cleanupOldJobs(olderThanMs: number, batch = 200): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const result = await db.execute(sql`
    WITH victims AS (
      SELECT id FROM generation_jobs
      WHERE created_at < ${cutoff}
      ORDER BY created_at ASC
      LIMIT ${batch}
    )
    DELETE FROM generation_jobs WHERE id IN (SELECT id FROM victims)
  `);
  return result.rowCount ?? 0;
}

export type { CardRecord, TrailRecord };
