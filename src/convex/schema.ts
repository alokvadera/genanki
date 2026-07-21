import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    providerRateState: defineTable({
      provider: v.string(),
      model: v.string(),
      windowStartedAt: v.number(),
      requestsUsed: v.number(),
      tokensUsed: v.number(),
      dayStartedAt: v.number(),
      dayRequestsUsed: v.number(),
      cooldownUntil: v.number(),
      lastStatus: v.optional(v.number()),
      remainingRequests: v.optional(v.number()),
      remainingTokens: v.optional(v.number()),
      resetAt: v.optional(v.number()),
      updatedAt: v.number(),
    })
      .index("by_provider_model", ["provider", "model"])
      .index("by_updatedAt", ["updatedAt"]),

    providerPerformance: defineTable({
      provider: v.string(),
      model: v.string(),
      calls: v.number(),
      successes: v.number(),
      failures: v.number(),
      timeouts: v.number(),
      averageLatencyMs: v.number(),
      averageTokens: v.number(),
      updatedAt: v.number(),
    }).index("by_provider_model", ["provider", "model"]),

    adaptiveSettings: defineTable({
      key: v.string(),
      documentMaxChunks: v.number(),
      completionPasses: v.number(),
      updatedAt: v.number(),
      source: v.string(),
    }).index("by_key", ["key"]),

    systemInsights: defineTable({
      kind: v.string(),
      status: v.string(),
      summary: v.string(),
      recommendation: v.string(),
      triggerCalls: v.number(),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),

    generationJobs: defineTable({
      kind: v.union(v.literal("prompt"), v.literal("document")),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("canceled"),
        v.literal("failed"),
      ),
      requestedCount: v.number(),
      progress: v.number(),
      etaSeconds: v.number(),
      timeoutSeconds: v.number(),
      deadlineAt: v.number(),
      message: v.string(),
      provider: v.optional(v.string()),
      model: v.optional(v.string()),
      providerIndex: v.number(),
      modelIndex: v.number(),
      totalProviders: v.number(),
      totalModels: v.number(),
      sectionIndex: v.number(),
      totalSections: v.number(),
      resultDeckName: v.optional(v.string()),
      resultSummary: v.optional(v.string()),
      resultCards: v.optional(
        v.array(
          v.object({
            front: v.string(),
            back: v.string(),
          }),
        ),
      ),
      resultPartial: v.optional(v.boolean()),
      resultWarnings: v.optional(v.array(v.string())),
      fallbackTrail: v.optional(
        v.array(
          v.object({
            provider: v.string(),
            model: v.string(),
            outcome: v.string(),
            reason: v.string(),
          }),
        ),
      ),
      cancelRequestedAt: v.optional(v.number()),
      canceledAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      error: v.optional(v.string()),

      // Encrypted fields for Zero-Knowledge IP-based privacy
      creatorIpHash: v.optional(v.string()),
      creatorDeviceIdHash: v.optional(v.string()),
      encDeckName: v.optional(v.string()),
      encSummary: v.optional(v.string()),
      encCards: v.optional(v.string()),
      encMessage: v.optional(v.string()),
      encError: v.optional(v.string()),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_creatorIpHash_createdAt", ["creatorIpHash", "createdAt"])
      .index("by_creatorDeviceIdHash_createdAt", ["creatorDeviceIdHash", "createdAt"]),

    providerUsage: defineTable({
      provider: v.string(),
      providerLabel: v.string(),
      model: v.string(),
      kind: v.union(v.literal("prompt"), v.literal("document")),
      jobId: v.optional(v.id("generationJobs")),
      promptTokens: v.number(),
      completionTokens: v.number(),
      totalTokens: v.number(),
      ip: v.optional(v.string()), // track client IP for admin usage statistics
      createdAt: v.number(),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_provider_createdAt", ["provider", "createdAt"])
      .index("by_jobId_createdAt", ["jobId", "createdAt"])
      .index("by_ip_createdAt", ["ip", "createdAt"]),

    generationTelemetry: defineTable({
      event: v.string(), // "summary" | "attempt"
      jobId: v.optional(v.id("generationJobs")),
      kind: v.optional(v.union(v.literal("prompt"), v.literal("document"))),
      requestedCount: v.optional(v.number()),
      generatedCount: v.optional(v.number()),
      duplicateCount: v.optional(v.number()),
      sourceChars: v.optional(v.number()),
      parseFailures: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      tokensUsed: v.optional(v.number()),
      metric: v.optional(v.number()),
      
      // new fields for "attempt" events
      provider: v.optional(v.string()),
      model: v.optional(v.string()),
      outcome: v.optional(v.string()),
      latencyMs: v.optional(v.number()),
      neurons: v.optional(v.number()),
      
      createdAt: v.number(),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_jobId_createdAt", ["jobId", "createdAt"]),

    cloudflareNeuronBudget: defineTable({
      utcDay: v.string(), // e.g. "2024-03-10"
      neuronsUsed: v.number(),
      updatedAt: v.number(),
    }).index("by_utcDay", ["utcDay"]),

    providerCatalog: defineTable({
      provider: v.string(),
      label: v.string(),
      modelCount: v.number(),
      models: v.array(v.object({ id: v.string(), name: v.string() })),
      updatedAt: v.number(),
    }).index("by_provider", ["provider"]),

    ipRateState: defineTable({
      deviceIdHash: v.optional(v.string()),
      associatedIps: v.optional(v.array(v.string())),
      ip: v.string(),
      dayWindowStart: v.number(),
      dayTokensUsed: v.number(),
      totalTokensAllTime: v.number(),
      totalRequests: v.number(),
      lastSeenAt: v.number(),
      firstSeenAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ip", ["ip"])
      .index("by_deviceIdHash", ["deviceIdHash"])
      .index("by_lastSeenAt", ["lastSeenAt"]),

    ipRules: defineTable({
      ip: v.string(),
      deviceIdHash: v.optional(v.string()),
      isBlocked: v.boolean(),
      customDailyLimit: v.optional(v.number()),
      note: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_ip", ["ip"])
      .index("by_deviceIdHash", ["deviceIdHash"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
