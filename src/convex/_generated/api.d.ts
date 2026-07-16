/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiProviders from "../aiProviders.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as availableProviders from "../availableProviders.js";
import type * as budget from "../budget.js";
import type * as clearData from "../clearData.js";
import type * as crons from "../crons.js";
import type * as deckGeneration from "../deckGeneration.js";
import type * as errors from "../errors.js";
import type * as generationJobs from "../generationJobs.js";
import type * as generationTelemetry from "../generationTelemetry.js";
import type * as http from "../http.js";
import type * as optimus from "../optimus.js";
import type * as promptBuilder from "../promptBuilder.js";
import type * as providerAdvisor from "../providerAdvisor.js";
import type * as providerCatalog from "../providerCatalog.js";
import type * as providerOrchestrator from "../providerOrchestrator.js";
import type * as providerUsage from "../providerUsage.js";
import type * as rateLimits from "../rateLimits.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiProviders: typeof aiProviders;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  availableProviders: typeof availableProviders;
  budget: typeof budget;
  clearData: typeof clearData;
  crons: typeof crons;
  deckGeneration: typeof deckGeneration;
  errors: typeof errors;
  generationJobs: typeof generationJobs;
  generationTelemetry: typeof generationTelemetry;
  http: typeof http;
  optimus: typeof optimus;
  promptBuilder: typeof promptBuilder;
  providerAdvisor: typeof providerAdvisor;
  providerCatalog: typeof providerCatalog;
  providerOrchestrator: typeof providerOrchestrator;
  providerUsage: typeof providerUsage;
  rateLimits: typeof rateLimits;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
