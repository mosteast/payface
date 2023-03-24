import { invalid_map } from "./message";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";

it("invalid_map", async () => {
  expect(invalid_map({ a: 11, b: "bb" })).toBe('a=11, b="bb"');
});
