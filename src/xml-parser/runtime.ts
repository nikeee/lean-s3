/** biome-ignore-all lint/suspicious/noAssignInExpressions: ok here */

/**
 * biome-ignore lint/suspicious/noConstEnum: Normally, we'd avoid using TS enums due to its incompability with JS.
 * But we want to inline its values into the switch-cases and still have readable code.
 */
const enum CharCode {
	lessThan = 0x3c,
	greaterThan = 0x3e,
	slash = 0x2f,
	equals = 0x3d,
	doubleQuote = 0x22,
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
	exclamationMark = 0x21,
	questionMark = 0x3f,
	minus = 0x2d,
}

export class Parser {
	scanner: Scanner;
	currentToken!: TokenKind;

	token = () => this.currentToken;
	nextToken = () => (this.currentToken = this.scanner.scan());

	constructor(text: string) {
		this.scanner = new Scanner(text);
		this.nextToken();
	}

	//#region primitives

	parseStringTag(tagName: string): string | undefined {
		if (this.token() !== TokenKind.startTag) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.startTag}, got: ${this.token()}`,
			);
		}
		this.nextToken();
		this.parseIdentifier(tagName);

		this.skipAttributesUntilTagEnd();
		if (this.token() === TokenKind.endSelfClosing) {
			return undefined;
		}

		this.nextToken(); // consume >

		if (this.token() === TokenKind.startClosingTag) {
			this.parseIdentifier(tagName);
			this.parseExpected(TokenKind.endTag);
			return "";
		}

		const value = this.scanner.getTokenValueDecoded();
		this.parseClosingTag(tagName);
		return value;
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
		if (this.token() !== TokenKind.startTag) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.startTag}, got: ${this.token()}`,
			);
		}
		this.nextToken();
		this.parseIdentifier(tagName);

		this.skipAttributesUntilTagEnd();
		if (this.token() === TokenKind.endSelfClosing) {
			return undefined;
		}

		this.nextToken(); // consume >

		if (this.token() === TokenKind.startClosingTag) {
			this.parseIdentifier(tagName);
			this.parseExpected(TokenKind.endTag);
			return undefined;
		}

		const stringValue = this.scanner.getTokenValueDecoded();

		const n = Number(stringValue);
		if (!Number.isInteger(n)) {
			throw new Error(`Value is not an integer: "${stringValue}"`);
		}

		this.parseClosingTag(tagName);
		return n;
	}

	parseBooleanTag(tagName: string): boolean | undefined {
		if (this.token() !== TokenKind.startTag) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.startTag}, got: ${this.token()}`,
			);
		}
		this.nextToken();
		this.parseIdentifier(tagName);

		this.skipAttributesUntilTagEnd();
		if (this.token() === TokenKind.endSelfClosing) {
			return undefined;
		}

		this.nextToken(); // consume >

		if (this.token() === TokenKind.startClosingTag) {
			this.parseIdentifier(tagName);
			this.parseExpected(TokenKind.endTag);
			return undefined;
		}

		const stringValue = this.scanner.getTokenValueDecoded();

		let value: boolean;
		if (stringValue === "true") {
			value = true;
		} else if (stringValue === "false") {
			value = false;
		} else {
			throw new Error(`Expected boolean, got "${stringValue}"`);
		}

		this.parseClosingTag(tagName);
		return value;
	}

	//#endregion

	parseClosingTag(tagName: string): void {
		this.parseExpected(TokenKind.startClosingTag);
		this.parseIdentifier(tagName);
		this.parseExpected(TokenKind.endTag);
	}

	parseExpected(expected: TokenKind): void {
		if (this.token() !== expected) {
			throw new Error(
				`Wrong token, expected: ${expected}, got: ${this.token()}`,
			);
		}
		this.nextToken();
	}

	parseIdentifier(identifier: string): void {
		if (this.token() !== TokenKind.identifier) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.identifier}, got: ${this.token()}`,
			);
		}
		if (this.scanner.getTokenValueEncoded() !== identifier) {
			throw new Error(
				`Expected identifier: ${identifier}, got: ${this.scanner.getTokenValueEncoded()}`,
			);
		}
	}

	skipAttributesUntilTagEnd(): void {
		// parse until opening tag is terminated
		do {
			// skip attributes
			if (this.token() === TokenKind.identifier) {
				this.nextToken();
				this.parseExpected(TokenKind.equals);
				this.parseExpected(TokenKind.attributeValue);
				continue;
			}
			if (
				this.token() === TokenKind.endTag ||
				this.token() === TokenKind.endSelfClosing
			) {
				this.nextToken();
				break;
			}
			throw new Error(`Unexpected token: ${this.token()}`);
			// biome-ignore lint/correctness/noConstantCondition: see above
		} while (true);
	}
}

/**
 * biome-ignore lint/suspicious/noConstEnum: Normally, we'd avoid using TS enums due to its incompability with JS.
 * But we want to inline its values into the switch-cases and still have readable code.
 *
 * @remarks This enum cannot be used in runtime code, since it's `const` and will not exist in the parsing stage. Values have to be inlined by the generator
 */
export const enum TokenKind {
	eof = 0,
	startTag = 1,
	endTag = 2, // >
	startClosingTag = 3, // </
	endSelfClosing = 4, // />
	identifier = 5,
	equals = 6, // =
	attributeValue = 7,
	textContent = 8,
	preamble = 9, // <?xml ?>
}

const entityMap = {
	"&quot;": '"',
	"&apos;": "'",
	"&lt;": "<",
	"&gt;": ">",
	"&amp;": "&",
} as const;

export class Scanner {
	startPos: number;
	pos: number;
	end: number;
	text: string;

	inTag = false;

	token = -1;

	tokenValueStart = -1;
	tokenValueEnd = -1;

	/**
	 * Doesn't do entity decoding for stuff like &amp;
	 * TODO: separate method that does decoding
	 */
	getTokenValueEncoded() {
		return this.text.substring(this.tokenValueStart, this.tokenValueEnd);
	}
	getTokenValueDecoded() {
		return this.getTokenValueEncoded().replace(
			/&(quot|apos|lt|gt|amp);/g,
			m => entityMap[m as keyof typeof entityMap] ?? m,
		);
	}

	constructor(text: string) {
		// Number(text); // collapse rope structure of V8
		this.startPos = 0;
		this.pos = 0;
		this.end = text.length;
		this.text = text;
	}

	scan(): TokenKind {
		this.startPos = this.pos;

		while (true) {
			if (this.pos >= this.end) {
				return (this.token = TokenKind.eof);
			}

			const ch = this.text.charCodeAt(this.pos);
			switch (ch) {
				case CharCode.lineFeed:
				case CharCode.carriageReturn:
				case CharCode.lineSeparator:
				case CharCode.paragraphSeparator:
				case CharCode.nextLine:
				case CharCode.tab:
				case CharCode.verticalTab:
				case CharCode.formFeed:
				case CharCode.space:
				case CharCode.nonBreakingSpace:
					++this.pos;
					continue;
				case CharCode.equals: {
					if (this.inTag) {
						++this.pos;
						return (this.token = TokenKind.equals);
					}
					const textNode = this.#scanTextNode();
					if (textNode === undefined) {
						continue;
					}
					return textNode;
				}
				case CharCode.lessThan:
					++this.pos;

					this.inTag = true;

					if (this.pos < this.end) {
						switch (this.text.charCodeAt(this.pos)) {
							case CharCode.slash:
								++this.pos;
								return (this.token = TokenKind.startClosingTag);
							case CharCode.questionMark:
								this.inTag = false;
								return this.#scanPreamble(this.pos - 1);
							default:
								break;
						}
					}
					return (this.token = TokenKind.startTag);
				case CharCode.greaterThan:
					++this.pos;
					this.inTag = false;
					return (this.token = TokenKind.endTag);
				case CharCode.slash:
					++this.pos;
					if (this.pos < this.end) {
						const nextChar = this.text.charCodeAt(this.pos);
						if (nextChar === CharCode.greaterThan) {
							++this.pos;
							return (this.token = TokenKind.endSelfClosing);
						}
					}
					return (this.token = TokenKind.endTag);

				case CharCode.doubleQuote: {
					// TODO: We actually don't care about attributes
					// We might just skip scanning everything after the tag identifier
					// > cannot appear in a quoted string, since it must be escaped
					if (this.inTag) {
						return this.#scanQuotedString();
					}

					const textNode = this.#scanTextNode();
					if (textNode === undefined) {
						continue;
					}
					return textNode;
				}
				default:
					if (this.inTag) {
						if (isIdentifierStart(ch)) {
							return this.#scanIdentifier();
						}
						++this.pos;
						continue;
					} else {
						const textNode = this.#scanTextNode();
						if (textNode === undefined) {
							continue;
						}
						return textNode;
					}
			}
		}
	}

	#scanTextNode(): TokenKind | undefined {
		// Read text node
		let tokenValueStart = this.pos;
		while (isWhitespace(this.text.charCodeAt(this.pos))) {
			++tokenValueStart;
		}

		while (
			this.pos < this.end &&
			this.text.charCodeAt(this.pos) !== CharCode.lessThan
		) {
			++this.pos;
		}

		let tokenValueEnd = this.pos;
		do {
			--tokenValueEnd;
		} while (isWhitespace(this.text.charCodeAt(tokenValueEnd)));
		++tokenValueEnd;

		if (tokenValueStart === tokenValueEnd) {
			// no text content, next token
			return undefined;
		}

		this.tokenValueStart = tokenValueStart;
		this.tokenValueEnd = tokenValueEnd;
		return (this.token = TokenKind.identifier);
	}

	#scanQuotedString(): TokenKind {
		++this.pos; // consume opening "
		const start = this.pos;
		while (
			this.pos < this.end &&
			this.text.charCodeAt(this.pos) !== CharCode.doubleQuote
		) {
			++this.pos;
		}

		++this.pos; // consume closing "
		this.tokenValueStart = start;
		this.tokenValueEnd = this.pos;

		return (this.token = TokenKind.attributeValue);
	}

	#scanIdentifier(): TokenKind {
		const identifierStart = this.pos;
		++this.pos;
		while (
			this.pos < this.end &&
			isIdentifierPart(this.text.charCodeAt(this.pos))
		) {
			++this.pos;
		}

		this.tokenValueStart = identifierStart;
		this.tokenValueEnd = this.pos;
		return (this.token = TokenKind.identifier);
	}

	#scanPreamble(tokenValueStart: number): TokenKind {
		++this.pos; // consume ?
		while (
			this.pos + 1 < this.end &&
			this.text.charCodeAt(this.pos) !== CharCode.questionMark &&
			this.text.charCodeAt(this.pos + 1) !== CharCode.greaterThan
		) {
			++this.pos;
		}
		++this.pos; // consume >

		this.tokenValueStart = tokenValueStart;
		this.tokenValueEnd = this.pos;
		return (this.token = TokenKind.preamble);
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

export function scanExpected(scanner: Scanner, expected: number): void {
	if (scanner.scan() !== expected) {
		throw new Error(
			`Wrong token, expected: ${expected}, got: ${scanner.token}`,
		);
	}
}

export function skipAttributes(scanner: Scanner): void {
	// parse until opening tag is terminated
	do {
		scanner.scan();

		// skip attributes
		if (scanner.token === TokenKind.identifier) {
			scanExpected(scanner, TokenKind.equals);
			scanExpected(scanner, TokenKind.attributeValue);
			continue;
		}
		if (
			scanner.token === TokenKind.endTag ||
			scanner.token === TokenKind.endSelfClosing
		) {
			break;
		}
		throw new Error(`Unexpected token: ${scanner.token}`);
		// biome-ignore lint/correctness/noConstantCondition: see above
	} while (true);
}

export function expectIdentifier(scanner: Scanner, identifier: string): void {
	scanExpected(scanner, TokenKind.identifier);
	if (scanner.getTokenValueEncoded() !== identifier) {
		throw new Error(
			`Expected closing tag for identifier: ${identifier}, got: ${scanner.getTokenValueEncoded()}`,
		);
	}
}
export function expectClosingTag(scanner: Scanner, tagName: string): void {
	scanExpected(scanner, TokenKind.startClosingTag);
	expectIdentifier(scanner, tagName);
	scanExpected(scanner, TokenKind.endTag);
}
export function parseStringTag(
	scanner: Scanner,
	tagName: string,
): string | undefined {
	skipAttributes(scanner);
	if (scanner.token === TokenKind.endSelfClosing) {
		return undefined;
	}

	scanner.scan(); // consume >
	if (scanner.token === TokenKind.startClosingTag) {
		expectIdentifier(scanner, tagName);
		scanExpected(scanner, TokenKind.endTag);
		return "";
	}

	const value = scanner.getTokenValueDecoded();
	expectClosingTag(scanner, tagName);
	return value;
}
export function parseDateTag(
	scanner: Scanner,
	tagName: string,
): Date | undefined {
	const value = parseStringTag(scanner, tagName);
	if (value === undefined) {
		return undefined;
	}

	const r = new Date(value);
	if (Number.isNaN(r.getTime())) {
		throw new Error(`Expected valid date time: "${value}"`);
	}
	return r;
}
export function parseIntegerTag(
	scanner: Scanner,
	tagName: string,
): number | undefined {
	skipAttributes(scanner);

	if (scanner.token === TokenKind.endSelfClosing) {
		return undefined;
	}

	scanner.scan(); // consume >
	const value = scanner.getTokenValueEncoded();
	const n = Number(value);
	if (!Number.isInteger(n)) {
		throw new Error(`Value is not an integer: "${value}"`);
	}
	expectClosingTag(scanner, tagName);
	return n;
}
export function parseBooleanTag(
	scanner: Scanner,
	tagName: string,
): boolean | undefined {
	skipAttributes(scanner);
	if (scanner.token === TokenKind.endSelfClosing) {
		return undefined;
	}

	scanner.scan(); // consume >

	const stringValue = scanner.getTokenValueEncoded();

	let value: boolean;
	if (stringValue === "true") {
		value = true;
	} else if (stringValue === "false") {
		value = false;
	} else {
		throw new Error(`Expected boolean, got "${stringValue}"`);
	}

	expectClosingTag(scanner, tagName);
	return value;
}
