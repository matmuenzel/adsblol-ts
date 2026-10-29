import { describe, expect, it } from "vitest";
import {
  AdsbLolError,
  HttpError,
  NetworkError,
  ParseError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "../src/errors/index.js";

describe("error class hierarchy", () => {
  it("RateLimitError is an HttpError, AdsbLolError and Error", () => {
    const err = new RateLimitError("https://api.adsb.lol/v2/hex/abc123", "slow down", 1500);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(AdsbLolError);
    expect(err).toBeInstanceOf(Error);
  });

  it("name equals the concrete class name", () => {
    expect(new AdsbLolError("x").name).toBe("AdsbLolError");
    expect(new HttpError(404, "https://api.adsb.lol/x", "").name).toBe("HttpError");
    expect(new RateLimitError("https://api.adsb.lol/x", "", undefined).name).toBe("RateLimitError");
    expect(new ValidationError("x", [], undefined).name).toBe("ValidationError");
    expect(new NetworkError("x").name).toBe("NetworkError");
    expect(new TimeoutError("x").name).toBe("TimeoutError");
    expect(new ParseError("x").name).toBe("ParseError");
  });

  it("keeps cause", () => {
    const cause = new Error("socket reset");
    const err = new NetworkError("request failed", { cause });
    expect(err.cause).toBe(cause);
  });

  it("HttpError stores status, url and a body snippet of at most 500 characters", () => {
    const body = "x".repeat(2000);
    const err = new HttpError(500, "https://api.adsb.lol/v2/hex/abc123", body);
    expect(err.status).toBe(500);
    expect(err.url).toBe("https://api.adsb.lol/v2/hex/abc123");
    expect(err.bodySnippet).toHaveLength(500);
    expect(err.message).toContain("500");
    expect(err.message).toContain("https://api.adsb.lol/v2/hex/abc123");
    expect(err.message).not.toContain("xxxxx");
  });

  it("RateLimitError has status 429 and retryAfterMs", () => {
    const err = new RateLimitError("https://api.adsb.lol/x", "", 2000);
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(2000);
    const noHint = new RateLimitError("https://api.adsb.lol/x", "", undefined);
    expect(noHint.retryAfterMs).toBeUndefined();
  });

  it("ValidationError.fromResponseBody reads detail[] from HTTPValidationError", () => {
    const err = ValidationError.fromResponseBody(
      {
        detail: [
          {
            loc: ["path", "lat"],
            msg: "Input should be less than or equal to 90",
            type: "less_than_equal",
          },
        ],
      },
      422,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.status).toBe(422);
    expect(err.issues[0]?.loc).toEqual(["path", "lat"]);
    expect(err.issues[0]?.msg).toBe("Input should be less than or equal to 90");
    expect(err.issues[0]?.type).toBe("less_than_equal");
    expect(err.message).toContain("path.lat");
    expect(err.message).toContain("Input should be less than or equal to 90");
  });

  it("ValidationError.fromResponseBody falls back to an unknown issue for unexpected bodies", () => {
    const err = ValidationError.fromResponseBody("garbage", 422);
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0]?.type).toBe("unknown");
    expect(err.issues[0]?.loc).toEqual([]);
    expect(err.issues[0]?.msg).toBe("garbage");
  });
});
