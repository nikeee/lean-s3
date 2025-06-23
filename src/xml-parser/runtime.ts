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

/**
 * biome-ignore lint/suspicious/noConstEnum: Normally, we'd avoid using TS enums due to its incompability with JS.
 * But we want to inline its values into the switch-cases and still have readable code.
 *
 * @remarks This enum cannot be used in runtime code, since it's `const` and will not exist in the parsing stage. Values have to be inlined by the generator
 */
export const enum TokenKind {
	eof = 0,
	startTag = 1,
	endTag = 2,
	startClosingTag = 3, // </
	endSelfClosing = 4, // />
	identifier = 5,
	equals = 6, // =
	attributeValue = 7,
	textContent = 8,
}

export class Scanner {
	startPos: number;
	pos: number;
	end: number;
	text: string;

	inTag = false;

	token = -1;

	tokenValueStart = -1;
	tokenValueEnd = -1;
	get tokenValue() {
		return this.text.substring(this.tokenValueStart, this.tokenValueEnd);
	}
	getTokenValue() {
		// TODO: boolean / separate method to entity escape
		return this.text.substring(this.tokenValueStart, this.tokenValueEnd);
	}

	constructor(text: string) {
		// Number(text); // collapse rope structure of V8
		this.startPos = 0;
		this.pos = 0;
		this.end = text.length;
		this.text = text;
	}

	skipPreamble(): void {
		// TODO: Make this optional
		let inPreamble = false;
		while (true) {
			const ch = this.text.charCodeAt(this.pos);
			++this.pos;
			switch (ch) {
				case CharCode.lessThan:
					inPreamble = true;
					break;
				case CharCode.greaterThan:
					if (inPreamble) {
						return;
					}
					break;
				default:
					break;
			}
		}
	}

	scan(): TokenKind {
		this.startPos = this.pos;

		while (true) {
			if (this.pos >= this.end) {
				return (this.token = TokenKind.eof);
			}

			let ch = this.text.charCodeAt(this.pos);
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
				case CharCode.equals:
					++this.pos;
					return (this.token = TokenKind.equals);
				case CharCode.lessThan:
					++this.pos;

					this.inTag = true;

					if (this.pos < this.end) {
						const nextChar = this.text.charCodeAt(this.pos);
						if (nextChar === CharCode.slash) {
							++this.pos;
							return (this.token = TokenKind.startClosingTag);
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
					if (this.inTag) {
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

					const textNode = this.#scanTextNode();
					if (textNode === undefined) {
						continue;
					}
					return textNode;
				}
				default:
					if (this.inTag) {
						if (isIdentifierStart(ch)) {
							const identifierStart = this.pos;
							++this.pos;
							while (
								this.pos < this.end &&
								isIdentifierPart((ch = this.text.charCodeAt(this.pos)))
							) {
								++this.pos;
							}

							this.tokenValueStart = identifierStart;
							this.tokenValueEnd = this.pos;
							// this.tokenValue = this.text.substring(identifierStart, this.pos);

							return (this.token = TokenKind.identifier);
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
		// TODO: First element gets cut off

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
		(ch >= CharCode._0 && ch <= CharCode._0)
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
		if (scanner.token === TokenKind.endTag) {
			break;
		}
		throw new Error(`Unexpected token: ${scanner.token}`);
		// biome-ignore lint/correctness/noConstantCondition: see above
	} while (true);
}

export function expectIdentifier(scanner: Scanner, identifier: string): void {
	scanExpected(scanner, TokenKind.identifier);
	if (scanner.tokenValue !== identifier) {
		throw new Error(
			`Expected closing tag for identifier: ${identifier}, got: ${scanner.tokenValue}`,
		);
	}
}
export function expectClosingTag(scanner: Scanner, tagName: string): void {
	scanExpected(scanner, TokenKind.startClosingTag);
	expectIdentifier(scanner, tagName);
	scanExpected(scanner, TokenKind.endTag);
}
export function parseStringTag(scanner: Scanner, tagName: string): string {
	skipAttributes(scanner);
	scanner.scan(); // consume >
	if (scanner.token === TokenKind.startClosingTag) {
		expectIdentifier(scanner, tagName);
		scanExpected(scanner, TokenKind.endTag);
		return "";
	}

	const value = scanner.tokenValue;
	expectClosingTag(scanner, tagName);
	return value;
}
export function parseDateTag(scanner: Scanner, tagName: string): Date {
	const value = parseStringTag(scanner, tagName);
	const r = new Date(value);
	if (Number.isNaN(r.getTime())) {
		throw new Error(`Expected valid date time: "${value}"`);
	}
	return r;
}
export function parseIntegerTag(scanner: Scanner, tagName: string): number {
	skipAttributes(scanner);
	scanner.scan(); // consume >
	const value = scanner.tokenValue;
	const n = Number(value);
	if (!Number.isInteger(n)) {
		throw new Error(`Value is not an integer: "${value}"`);
	}
	expectClosingTag(scanner, tagName);
	return n;
}
export function parseBooleanTag(scanner: Scanner, tagName: string): boolean {
	skipAttributes(scanner);
	scanner.scan(); // consume >

	const stringValue = scanner.tokenValue;

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
