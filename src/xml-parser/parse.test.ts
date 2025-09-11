import { describe, test } from "node:test";
import { expect } from "expect";
import { buildParser } from "./generator.ts";

describe("xml parsing", () => {
	test("optional preamble", () => {
		const parse = buildParser({
			type: "root",
			children: {
				note: {
					type: "object",
					children: {},
				},
			},
		});

		expect(
			parse(`<?xml version="1.0" encoding="UTF-8"?><note></note>`),
		).toStrictEqual({ note: {} });
		expect(
			parse(`<?xml version="1.0" encoding="utf-8"?><note></note>`),
		).toStrictEqual({ note: {} });
		expect(
			parse(`<?xml version="1.0" encoding="utf-8"?>


				<note></note>`),
		).toStrictEqual({ note: {} });
		expect(
			parse(`<?xml
				version="1.0"encoding="utf-8"?>

				<note></note>`),
		).toStrictEqual({ note: {} });
		expect(parse(`<note></note>`)).toStrictEqual({ note: {} });
	});

	test("empty + self-closing tag", () => {
		const parse = buildParser({
			type: "root",
			children: {
				note: {
					type: "object",
					children: {},
				},
			},
		});

		expect(parse(`<note></note>`)).toStrictEqual({ note: {} });
		expect(parse(`<note/>`)).toStrictEqual({ note: {} });
		expect(parse(`<note />`)).toStrictEqual({ note: {} });

		const parse2 = buildParser({
			type: "root",
			children: {
				note: {
					type: "string",
				},
			},
		});
		expect(parse2(`<note></note>`)).toStrictEqual({ note: "" });
		expect(() => parse2(`<note/>`)).toThrow(
			new Error(
				`Value for field "note" was required but not present (expected as tag name "note").`,
			),
		);
		expect(() => parse2(`<note />`)).toThrow(
			new Error(
				`Value for field "note" was required but not present (expected as tag name "note").`,
			),
		);
	});

	describe("attributes", () => {
		const parse = buildParser({
			type: "root",
			children: {
				user: {
					type: "object",
					children: {},
				},
			},
		});

		test("skips attributes", () => {
			const xml = `<user id="123" name="John Doe" />`;
			expect(parse(xml)).toStrictEqual({ user: {} });
		});
		test("skipes quotes in attributes", () => {
			const xml = `<user name="John &quot;The Man&quot; Doe" />`;
			expect(parse(xml)).toStrictEqual({ user: {} });
		});
		test("skipps apostrophe (&apos;) in attributes", () => {
			const xml = `<user nickname="O&apos;Connor" />`;
			expect(parse(xml)).toStrictEqual({ user: {} });
		});
	});

	const noteSchema = {
		type: "root",
		children: {
			note: {
				type: "object",
				children: {
					to: {
						type: "string",
					},
					from: {
						type: "string",
					},
				},
			},
		},
	} as const;

	test("parses a simple XML string", () => {
		const parse = buildParser(noteSchema);
		const xml = `<?xml version="1.0" encoding="UTF-8"?><note><to>Alice</to><from>Bob</from></note>`;
		const doc = parse(xml);

		expect(doc).toStrictEqual({
			note: {
				from: "Bob",
				to: "Alice",
			},
		});
	});

	test("handles malformed XML", () => {
		const parse = buildParser(noteSchema);
		const malformed = `<note><to>Alice</to><from>Bob</from>`; // missing closing </note>
		expect(() => parse(malformed)).toThrow();
	});

	describe("entity decoding", () => {
		const parse = buildParser({
			type: "root",
			children: {
				code: {
					type: "string",
					tagName: "Code",
				},
			},
		});

		test("parses ampersand (&amp;) correctly", () => {
			const doc = parse(`<Code>Tom &amp; Jerry</Code>`);
			expect(doc).toStrictEqual({
				code: "Tom & Jerry",
			});
		});

		test("parses less-than (&lt;) and greater-than (&gt;)", () => {
			const doc = parse(`<Code>&lt;div&gt;Hello&lt;/div&gt;</Code>`);
			expect(doc).toStrictEqual({
				code: "<div>Hello</div>",
			});
		});

		test("parses mixed escape characters", () => {
			const doc = parse(
				`<Code>&quot;Use &lt; and &gt; for tags,&quot; she said &amp; left.</Code>`,
			);
			expect(doc).toStrictEqual({
				code: `"Use < and > for tags," she said & left.`,
			});
		});

		test("raw quotes in texts", () => {
			const doc = parse(`<Code>"etag-value"</Code>`);
			expect(doc).toStrictEqual({
				code: `"etag-value"`,
			});
		});

		test("leading and trailing equals", () => {
			expect(parse(`<Code>=equal</Code>`)).toStrictEqual({
				code: `=equal`,
			});
			expect(parse(`<Code>equal=</Code>`)).toStrictEqual({
				code: `equal=`,
			});
			expect(parse(`<Code>=equal=</Code>`)).toStrictEqual({
				code: `=equal=`,
			});
		});

		test("leading and trailing raw quotes", () => {
			expect(parse(`<Code>=equal"</Code>`)).toStrictEqual({
				code: `=equal"`,
			});
			expect(parse(`<Code>"equal=</Code>`)).toStrictEqual({
				code: `"equal=`,
			});
			expect(parse(`<Code>"=equal="</Code>`)).toStrictEqual({
				code: `"=equal="`,
			});
		});

		test("leading and trailing slash", () => {
			expect(parse(`<Code>/equal</Code>`)).toStrictEqual({
				code: `/equal`,
			});
			expect(parse(`<Code>equal/</Code>`)).toStrictEqual({
				code: `equal/`,
			});
			expect(parse(`<Code>/equal/</Code>`)).toStrictEqual({
				code: `/equal/`,
			});
		});
	});
});

describe("optimizations", () => {
	test("is whitespace", () => {
		// biome-ignore lint/suspicious/noConstEnum: will be inlined by the compiler
		const enum CharCode {
			lessThan = 0x3c,
			greaterThan = 0x3e,
			slash = 0x2f,
			A = 0x41,
			Z = 0x5a,
			a = 0x61,
			z = 0x7a,
			_ = 0x5f,
			_0 = 0x30,
			_9 = 0x39,
			tab = 0x09,
			space = 0x20,
			lineFeed = 0x0a,
			carriageReturn = 0x0d,
			verticalTab = 0x0b, // \v
			formFeed = 0x0c, // \f
			nonBreakingSpace = 0xa0, //
			lineSeparator = 0x2028,
			paragraphSeparator = 0x2029,
			nextLine = 0x85,
			questionMark = 0x3f,
		}

		function isWhitespaceReference(ch: number) {
			return (
				ch === CharCode.space ||
				ch === CharCode.tab ||
				ch === CharCode.lineFeed ||
				ch === CharCode.carriageReturn ||
				ch === CharCode.verticalTab ||
				ch === CharCode.formFeed ||
				ch === CharCode.nonBreakingSpace ||
				ch === CharCode.lineSeparator ||
				ch === CharCode.paragraphSeparator ||
				ch === CharCode.nextLine
			);
		}

		function isWhitespaceBinary(ch: number) {
			return (
				(ch >= 0x09 && ch <= 0x0d) ||
				ch === 0x20 ||
				ch === 0xa0 || // NBSP
				ch === 0x85 || // Next line
				ch === 0x2028 || // Line separator
				ch === 0x2029 // Paragraph separator
			);
		}
		for (let i = 0; i < 0x3000; ++i) {
			expect(isWhitespaceBinary(i)).toBe(isWhitespaceReference(i));
		}
	});
});
