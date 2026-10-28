import { describe, test } from "node:test";
import { expect } from "expect";
import {
	encodeObjectKey,
	encodeURIComponentExtended,
	getContentDispositionHeader as encode,
} from "./encode.ts";
import { sigV4UriEncode, sweepChars } from "./test/sigv4.ts";

void describe("encoding", () => {
	void test("RFC5987", () => {
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

		expect(
			encode({
				type: "attachment",
				filename: "test.txt",
			}),
		).toBe(`attachment;filename="test.txt";filename*=UTF-8''test.txt`);

		expect(
			encode({
				type: "attachment",
				filename: "füße.txt",
			}),
		).toBe(`attachment;filename="f%C3%BC%C3%9Fe.txt";filename*=UTF-8''f%C3%BC%C3%9Fe.txt`);

		expect(
			encode({
				type: "attachment",
				filename: "résumé.pdf",
			}),
		).toBe(`attachment;filename="r%C3%A9sum%C3%A9.pdf";filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`);

		expect(
			encode({
				type: "attachment",
				filename: "你好.txt",
			}),
		).toBe(
			`attachment;filename="%E4%BD%A0%E5%A5%BD.txt";filename*=UTF-8''%E4%BD%A0%E5%A5%BD.txt`,
		);

		expect(
			encode({
				type: "attachment",
				filename: "a b c.txt",
			}),
		).toBe(`attachment;filename="a%20b%20c.txt";filename*=UTF-8''a%20b%20c.txt`);

		expect(
			encode({
				type: "attachment",
				filename: "emoji-💾.zip",
			}),
		).toBe(
			`attachment;filename="emoji-%F0%9F%92%BE.zip";filename*=UTF-8''emoji-%F0%9F%92%BE.zip`,
		);
	});
});

void describe("encodeURIComponentExtended", () => {
	void test("matches SigV4 UriEncode for every ASCII character and some non-ASCII ones", () => {
		for (const c of [...sweepChars, "/"]) {
			const value = `a${c}b`;
			expect({ c, encoded: encodeURIComponentExtended(value) }).toStrictEqual({
				c,
				encoded: sigV4UriEncode(value),
			});
		}
	});
});

void describe("encodeObjectKey", () => {
	void test("matches SigV4 UriEncode for every ASCII character and some non-ASCII ones", () => {
		for (const c of sweepChars) {
			const key = `prefix/a${c}b/${c}`;
			const expected = `prefix/a${sigV4UriEncode(c)}b/${sigV4UriEncode(c)}`;
			expect({ c, encoded: encodeObjectKey(key) }).toStrictEqual({ c, encoded: expected });
		}
	});

	void test("keeps slashes, including leading, trailing and repeated ones", () => {
		expect(encodeObjectKey("a//b/")).toBe("a//b/");
		expect(encodeObjectKey("/a")).toBe("/a");
	});
});
