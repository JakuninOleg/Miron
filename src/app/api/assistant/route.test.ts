import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  history: vi.fn(),
  send: vi.fn(),
  confirm: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/assistant/service", () => ({
  getAssistantHistory: mocks.history,
  sendAssistantMessage: mocks.send,
  confirmAssistantAction: mocks.confirm,
}));
vi.mock("@/server/assistant/history", () => ({ mutateChatHistory: mocks.mutate }));
import { GET, POST, DELETE } from "./route";
import { POST as confirm } from "./actions/route";

describe("assistant route authorization and private response bounds", () => {
  it("rejects cross-site and oversized deletion before touching history", async () => {
    mocks.requireUser.mockResolvedValue({ id: "alice" });
    const headers = { "x-miron-owner": "alice", "content-type": "application/json" };
    const crossSite = await DELETE(
      new Request("http://localhost/api/assistant", {
        method: "DELETE",
        headers: { ...headers, "sec-fetch-site": "cross-site" },
        body: "{}",
      }),
    );
    expect(crossSite.status).toBe(403);
    const large = await DELETE(
      new Request("http://localhost/api/assistant", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ text: "x".repeat(2100) }),
      }),
    );
    expect(large.status).toBe(413);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "alice" });
  });
  it("rejects absent/mismatched owner before private reads or model/action calls", async () => {
    for (const handler of [GET, POST, DELETE, confirm]) {
      const response = await handler(
        new Request("http://localhost/api/assistant", {
          method: handler === GET ? "GET" : "POST",
          headers: { "x-miron-owner": "bob", "content-type": "application/json" },
          ...(handler === GET ? {} : { body: "{}" }),
        }),
      );
      expect(response.status).toBe(409);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-site requests", async () => {
    mocks.requireUser.mockRejectedValueOnce(Object.assign(new Error("Войдите"), { status: 401 }));
    expect((await GET(new Request("http://localhost/api/assistant"))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/assistant", {
            method: "POST",
            headers: {
              "x-miron-owner": "alice",
              "content-type": "application/json",
              "sec-fetch-site": "cross-site",
            },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("bounds request bodies and returns no-store for success", async () => {
    const large = new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "x-miron-owner": "alice", "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(8_200) }),
    });
    expect((await POST(large)).status).toBe(413);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.history.mockResolvedValue({ enabled: true, messages: [] });
    const response = await GET(
      new Request("http://localhost/api/assistant", { headers: { "x-miron-owner": "alice" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
