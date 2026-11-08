/**
 * Host renderCall contract coverage.
 *
 * The two hosts that load this extension invoke `renderCall` with different,
 * documented argument orders:
 *
 * - pi (earendil-works/pi): (args, theme, context) — the theme is a pi Theme
 *   class instance (modes/interactive/components/tool-execution.ts).
 * - oh-my-pi (can1357/oh-my-pi): (args, options, theme) — options is a plain
 *   { expanded, isPartial, spinnerFrame? } object (docs/extensions.md).
 *
 * renderProcessCall must render under both orders.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolCallEvent,
  ToolDefinition,
  ToolExecutionEndEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { ProcessManager } from "../../../src/manager";
import type { NotificationRegistry } from "../notifications/registry";
import { registerProcessTool } from "./index";

type RenderCallFn = NonNullable<ToolDefinition["renderCall"]>;
type RenderCallFnContext = Parameters<RenderCallFn>[2];

/** The normalized renderer accepts both host argument orders. */
type HostRenderCall = (
  args: Parameters<RenderCallFn>[0],
  second: Theme | RenderCallFnContext,
  third?: RenderCallFnContext | Theme,
) => ReturnType<RenderCallFn>;

/** Theme-like object, as passed by host Pi/OMP package copies. */
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function captureRenderCall(): HostRenderCall {
  const pi = { registerTool: vi.fn(), on: vi.fn() } as unknown as ExtensionAPI;
  registerProcessTool(pi, {} as ProcessManager, {} as NotificationRegistry);
  const tool = vi.mocked(pi.registerTool).mock.calls[0]?.[0] as ToolDefinition;
  if (!tool.renderCall) throw new Error("process tool was not registered");
  return tool.renderCall as unknown as HostRenderCall;
}

describe("renderCall host argument order", () => {
  it("renders with pi order: (args, theme, context)", () => {
    const renderCall = captureRenderCall();
    const component = renderCall({ action: "list" }, theme, {
      expanded: false,
    } as RenderCallFnContext);
    expect(component.render(80).join("\n")).toContain("Process:");
  });

  it("renders with OMP order: (args, options, theme)", () => {
    const renderCall = captureRenderCall();
    const component = renderCall(
      { action: "list" },
      { expanded: false, isPartial: true } as RenderCallFnContext,
      theme,
    );
    expect(component.render(80).join("\n")).toContain("Process:");
  });
});

describe("process notification ownership", () => {
  function harness() {
    const pi = {
      registerTool: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;
    const register = vi.fn();
    const manager = {
      start: vi
        .fn()
        .mockReturnValue({ id: "proc_1", name: "server", pid: 123 }),
    } as unknown as ProcessManager;
    registerProcessTool(pi, manager, {
      register,
    } as unknown as NotificationRegistry);
    const tool = vi.mocked(pi.registerTool).mock
      .calls[0]?.[0] as ToolDefinition;
    const handler = (name: string) => {
      const registration = vi
        .mocked(pi.on)
        .mock.calls.find(([event]) => event === name);
      if (!registration) throw new Error(`Missing ${name} handler`);
      return registration[1] as unknown as (
        event: ToolCallEvent | ToolResultEvent | ToolExecutionEndEvent,
      ) => void;
    };
    const ctx = {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session",
        getSessionFile: () => undefined,
      },
    } as unknown as ExtensionContext;
    return {
      register,
      call: (toolCallId: string, parentToolCallId: string) =>
        handler("tool_call")({
          type: "tool_call",
          toolCallId,
          parentToolCallId,
          toolName: "process",
          input: {},
        } as ToolCallEvent),
      result: (toolCallId: string) =>
        handler("tool_result")({
          type: "tool_result",
          toolCallId,
        } as ToolResultEvent),
      end: (toolCallId: string) =>
        handler("tool_execution_end")({
          type: "tool_execution_end",
          toolCallId,
          toolName: "process",
          result: { content: [], details: undefined },
          isError: true,
        } as ToolExecutionEndEvent),
      start: (id: string) =>
        tool.execute(
          id,
          { action: "start", name: "server", command: "echo ready" },
          undefined,
          undefined,
          ctx as never,
        ),
    };
  }

  it("captures a direct process start call as its visible owner", async () => {
    const h = harness();
    await h.start("direct-call");
    expect(h.register).toHaveBeenCalledWith(
      "proc_1",
      expect.any(Object),
      "direct-call",
    );
  });

  it("resolves nested starts to the outermost visible call", async () => {
    const h = harness();
    h.call("nested-wrapper", "visible-wrapper");
    h.call("nested-process", "nested-wrapper");
    await h.start("nested-process");
    expect(h.register).toHaveBeenCalledWith(
      "proc_1",
      expect.any(Object),
      "visible-wrapper",
    );
  });

  it("clears ancestry for a blocked nested call without a tool_result", async () => {
    const h = harness();
    h.call("blocked-call", "visible-wrapper");
    h.end("blocked-call");
    await h.start("blocked-call");
    expect(h.register).toHaveBeenCalledWith(
      "proc_1",
      expect.any(Object),
      "blocked-call",
    );
  });

  it("drops transient ancestry after the tool result", async () => {
    const h = harness();
    h.call("nested-process", "visible-wrapper");
    h.result("nested-process");
    await h.start("nested-process");
    expect(h.register).toHaveBeenCalledWith(
      "proc_1",
      expect.any(Object),
      "nested-process",
    );
  });
});
