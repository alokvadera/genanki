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

    rateLimits: defineTable({
      userId: v.string(),
      timestamp: v.number(),
    }).index("by_user", ["userId"]),

    generationJobs: defineTable({
      kind: v.union(v.literal("prompt"), v.literal("document")),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
      requestedCount: v.number(),
      progress: v.number(),
      etaSeconds: v.number(),
      message: v.string(),
      provider: v.optional(v.string()),
      model: v.optional(v.string()),
      providerIndex: v.number(),
      modelIndex: v.number(),
      totalProviders: v.number(),
      totalModels: v.number(),
      sectionIndex: v.number(),
      totalSections: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
      error: v.optional(v.string()),
    }).index("by_createdAt", ["createdAt"]),

    providerUsage: defineTable({
      provider: v.string(),
      providerLabel: v.string(),
      model: v.string(),
      kind: v.union(v.literal("prompt"), v.literal("document")),
      jobId: v.optional(v.id("generationJobs")),
      promptTokens: v.number(),
      completionTokens: v.number(),
      totalTokens: v.number(),
      createdAt: v.number(),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_provider_createdAt", ["provider", "createdAt"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
