import { describe, expect, it } from "vitest";
import { createNotificationRegistry } from "./registry";

describe("notification parent ownership", () => {
  it("retains ownership across watch updates", () => {
    const registry = createNotificationRegistry();
    registry.register("proc_1", {}, "start-owner");
    registry.replaceWatches("proc_1", [{ pattern: "ready" }]);
    registry.clearWatches("proc_1");
    expect(registry.getParentToolCallId("proc_1")).toBe("start-owner");
  });

  it("clears stale ownership when an ID is registered without a parent", () => {
    const registry = createNotificationRegistry();
    registry.register("proc_1", {}, "old-owner");
    registry.register("proc_1", {});
    expect(registry.getParentToolCallId("proc_1")).toBeUndefined();
  });

  it("removes ownership on unregister and clear", () => {
    const registry = createNotificationRegistry();
    registry.register("proc_1", {}, "owner-1");
    registry.register("proc_2", {}, "owner-2");
    registry.unregister("proc_1");
    expect(registry.getParentToolCallId("proc_1")).toBeUndefined();
    expect(registry.getParentToolCallId("proc_2")).toBe("owner-2");
    registry.clear();
    expect(registry.getParentToolCallId("proc_2")).toBeUndefined();
  });
});
