import request from "supertest";
import { createApp } from "../app";

describe("quotes routes", () => {
  const app = createApp();

  it("GET /quotes returns a quote with the expected schema", async () => {
    const res = await request(app).get("/quotes");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        quote: expect.any(String),
        author: expect.any(String),
        category: expect.any(String),
      }),
    );
  });

  it("GET /quotes/:id returns the quote when it exists", async () => {
    const res = await request(app).get("/quotes/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("1");
    expect(res.body.author).toBe("Linus Torvalds");
  });

  it("GET /quotes/:id returns 404 when missing", async () => {
    const res = await request(app).get("/quotes/does-not-exist");
    expect(res.status).toBe(404);
  });
});
