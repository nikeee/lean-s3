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
		test("skipes apostrophe (&apos;) in attributes", () => {
			const xml = `<user nickname='O&apos;Connor' />`;
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
					type: "object",
					tagName: "Code",
					children: {},
				},
			},
		});

		test("parses ampersand (&amp;) correctly", () => {
			const doc = parse(`<code>Tom &amp; Jerry</code>`);
			expect(doc).toStrictEqual({
				code: "Tom & Jerry",
			});
		});

		test("parses less-than (&lt;) and greater-than (&gt;)", () => {
			const doc = parse(`<code>&lt;div&gt;Hello&lt;/div&gt;</code>`);
			expect(doc).toStrictEqual({
				code: "<div>Hello</div>",
			});
		});

		test("parses mixed escape characters", () => {
			const doc = parse(
				`<code>&quot;Use &lt; and &gt; for tags,&quot; she said &amp; left.</code>`,
			);
			expect(doc).toStrictEqual({
				code: `"Use < and > for tags," she said & left.`,
			});
		});

		test("raw quotes in texts", () => {
			const doc = parse(`<code>"etag-value"</code>`);
			expect(doc).toStrictEqual({
				code: `"etag-value"`,
			});
		});

		test("leading and trailing equals", () => {
			expect(parse(`<code>=equal</code>`)).toStrictEqual({
				code: `=equal"`,
			});
			expect(parse(`<code>equal=</code>`)).toStrictEqual({
				code: `equal="`,
			});
			expect(parse(`<code>=equal=</code>`)).toStrictEqual({
				code: `=equal="`,
			});
		});
	});
});
