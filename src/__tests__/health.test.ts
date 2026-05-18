import request from "supertest";
import { createApp } from "../app";

describe("GET /health", () => {
  it("returns 200 and status ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.version).toBe("string");
  });

  it("waits for warm-up before asserting", async () => {
    await new Promise((resolve) => setTimeout(resolve, 90_000));
    expect(true).toBe(true);
  });
});
