import { describe, expect, it, vi } from "vitest";
import { update } from "./generationJobs";

type RegisteredMutation = {
  exportArgs: () => string;
  _handler: (ctx: { db: { patch: (jobId: string, patch: Record<string, unknown>) => Promise<void> } }, args: Record<string, unknown>) => Promise<void>;
};

const registeredUpdate = update as unknown as RegisteredMutation;

describe("generationJobs.update", () => {
  it("accepts creatorDeviceIdHash in its argument validator", () => {
    const validator = JSON.parse(registeredUpdate.exportArgs()) as {
      value: Record<string, { fieldType?: { type?: string }; optional?: boolean }>;
    };

    expect(validator.value.creatorDeviceIdHash).toEqual({
      fieldType: { type: "string" },
      optional: true,
    });
  });

  it("persists creatorDeviceIdHash when supplied", async () => {
    const patch = vi.fn().mockResolvedValue(undefined);

    await registeredUpdate._handler(
      { db: { patch } },
      { jobId: "generation-job-id", creatorDeviceIdHash: "device-hash" },
    );

    expect(patch).toHaveBeenCalledWith("generation-job-id", {
      updatedAt: expect.any(Number),
      creatorDeviceIdHash: "device-hash",
    });
  });
});
