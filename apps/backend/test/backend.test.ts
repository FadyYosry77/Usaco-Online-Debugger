import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppContext } from "../src/server/appContext.js";
import { createServer } from "../src/server/createServer.js";
import { DEFAULT_SETTINGS } from "../src/storage/defaults.js";
import { analyzeCppSourceSnapshot, validateCppSourceSnapshot } from "../src/utils/sourceValidation.js";

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer(await createAppContext());
});

afterAll(async () => {
  await server.close();
});

describe("backend integration", () => {
  it("responds on the health endpoint", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "usaco-local-debug-helper-backend",
      mode: "practice-only"
    });
  });

  it("persists testcases through the service wiring", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/testcases",
      payload: {
        name: "sample1",
        input: "1 2\n",
        expectedOutput: "3\n"
      }
    });
    expect(create.statusCode).toBe(200);

    const list = await server.inject({ method: "GET", url: "/testcases" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sample1" })]));
  });

  it("uses the USACO-compatible default C++ standard", () => {
    expect(DEFAULT_SETTINGS.cxxStandard).toBe("c++17");
  });

  it("warns about suspicious fragments without blocking compilation", () => {
    const source = `
using vi = vector<int>;
const ld eps = 1e-9;
void fady() {
  ll n; cin >> n;
}
int32_t main() { fady(); }
`;
    const result = validateCppSourceSnapshot(source);
    const warnings = analyzeCppSourceSnapshot(source);

    expect(result.ok).toBe(true);
    expect(warnings.join(" ")).toMatch(/no #include/i);
  });
});
