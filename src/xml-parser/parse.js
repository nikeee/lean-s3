import * as rt from "./runtime.ts";
class GeneratedParser extends rt.Parser {
	fn_1_note() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {};

		console.assert(this.scanner.getTokenValueEncoded() === "note");

		if (this.token === 2 /* TokenKind.selfClosedTag */) {
			this.nextToken();

			return res;
		}

		this.nextToken();

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.endTag */:
					this.parseClosingTag("note");

					return res;
				case 0:
					throw new Error(`Unterminated tag: "note"`);

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
		`<?xml version="1.0" encoding="utf-8"?><note></note>`,
	).parse_0(),
);
