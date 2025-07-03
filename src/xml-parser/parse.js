import * as rt from "./runtime.ts";
/** @param {rt.Parser} parser */
function fn_1_note(parser) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {};

	parser.parseIdentifier("note");

	if (parser.token() === 4 /* TokenKind.endSelfClosing */) {
		parser.nextToken();

		return res;
	}

	parser.parseExpected(2 /* TokenKind.endTag */);

	while (true) {
		switch (parser.token()) {
			case 3 /* TokenKind.startClosingTag */:
				parser.nextToken(); // consume TokenKind.startClosingTag

				parser.parseIdentifier("note");
				parser.parseExpected(2 /* TokenKind.endTag */);

				return res;
			case 0:
				throw new Error(`Unterminated tag: "note"`);

			default:
				throw new Error(`Unhandled token kind: ${parser.token()}`);
		}
	}
}

/** @param {rt.Parser} parser */
function root_parse_fn_0(parser) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		note: undefined,
	};

	if (parser.token() === 9 /* TokenKind.preamble */) {
		parser.nextToken();
	}

	while (true) {
		switch (parser.token()) {
			case 0 /* TokenKind.eof */:
				if (res.note === undefined)
					throw new TypeError(
						`Value for field "note" was required but not present (expected as tag name "note").`,
					);
				return res;

			case 1 /* TokenKind.startTag */: {
				parser.nextToken(); // consume TokenKind.startTag

				switch (parser.scanner.getTokenValueEncoded()) {
					case "note":
						res.note = fn_1_note(parser);
						break;
					default:
						throw new Error(
							`Unexpected tag identifier: ${parser.scanner.getTokenValueEncoded()}`,
						);
				}
				break;
			}

			default:
				throw new Error(`Unhandled token kind: ${parser.token()}`);
		}
	}
}

root_parse_fn_0(
	new rt.Parser(`<?xml version="1.0" encoding="utf-8"?><note></note>`),
);
