import * as rt from "./runtime.ts";
class GeneratedParser extends rt.Parser {
	fn_1_note() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {};

		this.parseIdentifier("note");

		if (this.token === 4 /* TokenKind.endSelfClosing */) {
			this.nextToken();

			return res;
		}

		this.parseExpected(2 /* TokenKind.endTag */);

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.startClosingTag */:
					this.nextToken(); // consume TokenKind.startClosingTag

					this.parseIdentifier("note");
					this.parseExpected(2 /* TokenKind.endTag */);

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

				case 1 /* TokenKind.startTag */: {
					this.nextToken(); // consume TokenKind.startTag

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
new GeneratedParser(text).parse_0(
	`<?xml version="1.0" encoding="utf-8"?><note></note>`,
);
