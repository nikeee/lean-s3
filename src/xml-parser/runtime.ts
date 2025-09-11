/** biome-ignore-all lint/suspicious/noAssignInExpressions: ok here */

export class Parser {
	scanner: Scanner;
	token!: TokenKind;

	nextToken = () => {
		this.token = this.scanner.scan();
	};

	constructor(text: string) {
		this.scanner = new Scanner(text);
		this.nextToken();
	}

	//#region primitives

	parseIgnoredTag(tagName: string): void {
		const identifier = this.scanner.getTokenValueEncoded();
		if (identifier !== tagName) {
			throw new Error(
				`Wrong identifier, expected: "${tagName}", got "${identifier}"`,
			);
		}

		if (this.token === TokenKind.tagSelfClosing) {
			this.nextToken();
			return;
		}

		// consume <identifier>
		this.nextToken();

		switch (this.token) {
			case TokenKind.endTag:
				this.parseClosingTag(tagName);
				return;
			default: {
				if (this.token !== TokenKind.textNode) {
					throw new Error(`Expected text content for tag "${tagName}".`);
				}
				this.nextToken();
				this.parseClosingTag(tagName);
				return;
			}
		}
	}

	parseStringTag(tagName: string): string | undefined {
		const identifier = this.scanner.getTokenValueEncoded();
		if (identifier !== tagName) {
			throw new Error(
				`Wrong identifier, expected: "${tagName}", got "${identifier}"`,
			);
		}

		if (this.token === TokenKind.tagSelfClosing) {
			this.nextToken();
			return undefined;
		}

		// consume <identifier>
		this.nextToken();

		switch (this.token) {
			case TokenKind.endTag:
				this.parseClosingTag(tagName);
				return "";
			default: {
				if (this.token !== TokenKind.textNode) {
					throw new Error(`Expected text content for tag "${tagName}".`);
				}

				const value = this.scanner.getTokenValueDecoded();
				this.nextToken();
				this.parseClosingTag(tagName);
				return value;
			}
		}
	}

	parseDateTag(tagName: string): Date | undefined {
		const value = this.parseStringTag(tagName);
		if (value === undefined) {
			return undefined;
		}

		const r = new Date(value);
		if (Number.isNaN(r.getTime())) {
			throw new Error(`Expected valid date time: "${value}"`);
		}
		return r;
	}

	parseIntegerTag(tagName: string): number | undefined {
		const value = this.parseStringTag(tagName);
		if (value === undefined) {
			return undefined;
		}

		const n = Number(value);
		if (!Number.isInteger(n)) {
			throw new Error(`Value is not an integer: "${value}"`);
		}
		return n;
	}

	parseBooleanTag(tagName: string): boolean | undefined {
		const value = this.parseStringTag(tagName);
		return value === undefined
			? undefined
			: value === "true"
				? true
				: value === "false"
					? false
					: undefined;
	}

	//#endregion

	parseClosingTag(tagName: string): void {
		if (this.token !== TokenKind.endTag) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.endTag}, got: ${this.token}`,
			);
		}

		const actualIdentifer = this.scanner.getTokenValueEncoded();
		if (actualIdentifer !== tagName) {
			// early exit to skip substring for string compare
			throw new Error(
				`Wrong identifier for closing tag, expected: "${tagName}", got "${actualIdentifer}"`,
			);
		}

		this.nextToken();
	}
}

/**
 * biome-ignore lint/suspicious/noConstEnum: Normally, we'd avoid using TS enums due to its incompability with JS.
 * But we want to inline its values into the switch-cases and still have readable code.
 *
 * @remarks This enum cannot be used in runtime code, since it's `const` and will not exist in the parsing stage. Values have to be inlined by the generator
 */
export const enum TokenKind {
	/** this is 0, so tagSelfClosing can be created by `tag | 1`, saving a branch */
	tag = 0, // <tagIdentifier
	tagSelfClosing = 1, // <tagIdentifier />
	endTag = 2, // </tagIdentifier>
	eof = 3,
	textNode = 4,
}

const entityPattern = /&(quot|apos|lt|gt|amp);/g;
const entityMap = {
	"&quot;": '"',
	"&apos;": "'",
	"&lt;": "<",
	"&gt;": ">",
	"&amp;": "&",
} as const;

/**
 * biome-ignore lint/suspicious/noConstEnum: Normally, we'd avoid using TS enums due to its incompability with JS.
 * But we want to inline its values into the switch-cases and still have readable code.
 */
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

class Scanner {
	pos: number;
	text: string;

	token = -1;

	// biome-ignore lint/style/noNonNullAssertion: filled in scanning
	tokenValue: string = null!;

	getTokenValueEncoded(): string {
		return this.tokenValue;
	}

	getTokenValueDecoded() {
		return this.getTokenValueEncoded().replace(
			entityPattern,
			m => entityMap[m as keyof typeof entityMap] ?? m,
		);
	}

	constructor(text: string) {
		// Number(text); // collapse rope structure of V8
		this.pos = 0;
		this.text = text;
		this.#skipPreamble();
	}

	scan(): TokenKind {
		while (isWhitespace(this.text.charCodeAt(this.pos))) {
			++this.pos;
		}

		if (this.pos >= this.text.length) {
			return (this.token = TokenKind.eof);
		}

		let ch = this.text.charCodeAt(this.pos);
		switch (ch) {
			case CharCode.lessThan:
				++this.pos; // consume <

				// assumption: preamble has already been skipped by the parser
				// -> we can only have a tag start or end here
				ch = this.text.charCodeAt(this.pos);
				switch (ch) {
					case CharCode.slash: {
						++this.pos; // consume /

						const tokenValueStart = this.pos; // identifier start

						ch = this.text.charCodeAt(this.pos);
						if (!isIdentifierStart(ch)) {
							throw new Error(`Invalid identifier start at offset ${this.pos}`);
						}
						++this.pos; // consume identifier start

						do {
							ch = this.text.charCodeAt(++this.pos);
						} while (isIdentifierPart(ch));

						this.tokenValue = this.text.substring(tokenValueStart, this.pos);

						this.pos = this.text.indexOf(">", this.pos);
						if (this.pos < 0) {
							throw new Error("Unterminated tag end.");
						}
						++this.pos; // consume >

						return (this.token = TokenKind.endTag);
					}
					default: {
						if (!isIdentifierStart(ch)) {
							throw new Error("Expected identifier start");
						}

						const tokenValueStart = this.pos; // identifier start
						++this.pos; // consume identifier start

						do {
							ch = this.text.charCodeAt(++this.pos);
						} while (isIdentifierPart(ch));

						this.tokenValue = this.text.substring(tokenValueStart, this.pos);

						this.pos = this.text.indexOf(">", this.pos);
						if (this.pos < 0) {
							throw new Error("Unterminated tag end.");
						}

						// we now have <identifier attr="a"> or <identifier attr="a" />
						const selfClosingFlag = Number(
							this.text.charCodeAt(this.pos - 1) === CharCode.slash,
						);

						++this.pos; // consume >

						return (this.token = TokenKind.tag | selfClosingFlag);
					}
				}
			default: {
				const tokenValueStart = this.pos;
				// we're at a text node with beginning trimmed away
				this.pos = this.text.indexOf("<", this.pos);
				if (this.pos < 0) {
					throw new Error("Unterminated text node.");
				}

				let tokenValueEnd = this.pos;
				while (isWhitespace(this.text.charCodeAt(tokenValueEnd))) {
					--tokenValueEnd;
				}

				this.tokenValue = this.text.substring(tokenValueStart, tokenValueEnd);

				return (this.token = TokenKind.textNode);
			}
		}
	}

	#skipPreamble(): void {
		while (isWhitespace(this.text.charCodeAt(this.pos))) {
			++this.pos;
		}

		if (
			this.text.charCodeAt(this.pos) !== CharCode.lessThan ||
			this.text.charCodeAt(this.pos + 1) !== CharCode.questionMark
		) {
			return;
		}

		++this.pos; // consume <

		const closingIndex = this.text.indexOf(">", this.pos);
		if (closingIndex === -1) {
			throw new Error("Unterminated XML preamble.");
		}
		const questionMarkIndex = closingIndex - 1;
		if (this.text.charCodeAt(questionMarkIndex) !== CharCode.questionMark) {
			throw new Error("Unterminated XML preamble.");
		}

		this.pos = closingIndex + 1; // consume >
	}
}

function isIdentifierStart(ch: number): boolean {
	return (
		(ch >= CharCode.A && ch <= CharCode.Z) ||
		(ch >= CharCode.a && ch <= CharCode.z) ||
		ch === CharCode._
	);
}

function isIdentifierPart(ch: number): boolean {
	return (
		(ch >= CharCode.A && ch <= CharCode.Z) ||
		(ch >= CharCode.a && ch <= CharCode.z) ||
		ch === CharCode._ ||
		(ch >= CharCode._0 && ch <= CharCode._9)
	);
}
function isWhitespace(ch: number): boolean {
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
