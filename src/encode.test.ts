import { describe, test } from "node:test";

import { expect } from "expect";

import { getContentDispositionHeader as encode } from "./encode.ts";

describe("encoding", () => {
	test("RFC5987", () => {
		expect(
			encode({
				type: "inline",
			}),
		).toBe(`inline`);
		expect(
			encode({
				type: "attachment",
			}),
		).toBe(`attachment`);
	});
});
