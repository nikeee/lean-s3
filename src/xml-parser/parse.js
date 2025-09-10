import * as rt from "./runtime.ts";
class GeneratedParser extends rt.Parser {
	fn_1_note() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			to: undefined,
			from: undefined,
		};

		console.assert(this.scanner.getTokenValueEncoded() === "note");

		if (this.token === 2 /* TokenKind.selfClosedTag */) {
			this.nextToken();
			if (res.to === undefined)
				throw new TypeError(
					`Value for field "to" was required but not present (expected as tag name "to").`,
				);
			if (res.from === undefined)
				throw new TypeError(
					`Value for field "from" was required but not present (expected as tag name "from").`,
				);
			return res;
		}

		this.nextToken();

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.endTag */:
					this.parseClosingTag("note");
					if (res.to === undefined)
						throw new TypeError(
							`Value for field "to" was required but not present (expected as tag name "to").`,
						);
					if (res.from === undefined)
						throw new TypeError(
							`Value for field "from" was required but not present (expected as tag name "from").`,
						);
					return res;
				case 0:
					throw new Error(`Unterminated tag: "note"`);

				case 1: {
					const identifier = this.scanner.getTokenValueEncoded();
					switch (identifier) {
						case "to":
							res.to = this.parseStringTag("to");
							break;
						case "from":
							res.from = this.parseStringTag("from");
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}

	parse_0() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			note: undefined,
		};

		while (true) {
			switch (this.token) {
				case 0 /* TokenKind.eof */:
					if (res.note === undefined)
						throw new TypeError(
							`Value for field "note" was required but not present (expected as tag name "note").`,
						);
					return res;

				/* TODO: Only emit self-closing tags if the child supports it? */
				case 2 /* TokenKind.selfClosedTag */:
				case 1 /* TokenKind.tag */: {
					switch (this.scanner.getTokenValueEncoded()) {
						case "note":
							res.note = this.fn_1_note();
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}
}
console.log(
	new GeneratedParser(
		`<?xml version="1.0" encoding="UTF-8"?><note><to>Alice</to><from>Bob</from></note>`,
	).parse_0(),
);
