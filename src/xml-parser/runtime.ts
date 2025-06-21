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

	constructor(text: string) {
		// Number(text); // collapse rope structure of V8
		this.startPos = 0;
		this.pos = 0;
		this.end = text.length;
		this.text = text;
	}

	skipPreamble() {
		// TODO: Make this optional
		let inPreamble = false;
		while (true) {
			const ch = this.text.charCodeAt(this.pos);
			++this.pos;
			switch (ch) {
				case charCode.lessThan:
					inPreamble = true;
					break;
				case charCode.greaterThan:
					if (inPreamble) {
						return;
					}
					break;
				default:
					break;
			}
		}
	}

	scan(): number {
		this.startPos = this.pos;

		while (true) {
			if (this.pos >= this.end) {
				// biome-ignore lint/suspicious/noAssignInExpressions: ok here
				return (this.token = tokenKind.eof);
			}

			let ch = this.text.charCodeAt(this.pos);
			switch (ch) {
				case charCode.lineFeed:
				case charCode.carriageReturn:
				case charCode.lineSeparator:
				case charCode.paragraphSeparator:
				case charCode.nextLine:
				case charCode.tab:
				case charCode.verticalTab:
				case charCode.formFeed:
				case charCode.space:
				case charCode.nonBreakingSpace:
					++this.pos;
					continue;
				case charCode.equals:
					++this.pos;
					// biome-ignore lint/suspicious/noAssignInExpressions: ok here
					return (this.token = tokenKind.equals);
				case charCode.lessThan:
					++this.pos;

					// TODO: Enable/disable comment handling
					/*
					if (
						(this.pos + 3) < this.end
						this.text.charCodeAt(this.pos + 1) === charCode.exclamationMark &&
						this.text.charCodeAt(this.pos + 2) === charCode.minus &&
						this.text.charCodeAt(this.pos + 3) === charCode.minus
					) {
						this.pos += 3;
						while (
							this.pos + 2 < this.end &&
							!(
								this.text.charCodeAt(this.pos) === CharCode.dash &&
								this.text.charCodeAt(this.pos + 1) === CharCode.dash &&
								this.text.charCodeAt(this.pos + 2) === CharCode.greaterThan
							)
						) {
							this.pos++;
						}
						this.pos += 3; // Skip -->
						continue;
					}
					*/

					this.inTag = true;

					if (this.pos < this.end) {
						const nextChar = this.text.charCodeAt(this.pos);
						if (nextChar === charCode.slash) {
							++this.pos;
							// biome-ignore lint/suspicious/noAssignInExpressions: ok here
							return (this.token = tokenKind.startClosingTag);
						}
					}
					// biome-ignore lint/suspicious/noAssignInExpressions: ok here
					return (this.token = tokenKind.startTag);
				case charCode.greaterThan:
					++this.pos;
					this.inTag = false;
					// biome-ignore lint/suspicious/noAssignInExpressions: ok here
					return (this.token = tokenKind.endTag);
				case charCode.slash:
					++this.pos;
					if (this.pos < this.end) {
						const nextChar = this.text.charCodeAt(this.pos);
						if (nextChar === charCode.greaterThan) {
							++this.pos;
							// biome-ignore lint/suspicious/noAssignInExpressions: ok here
							return (this.token = tokenKind.endSelfClosing);
						}
					}
					// biome-ignore lint/suspicious/noAssignInExpressions: ok here
					return (this.token = tokenKind.endTag);

				// biome-ignore lint/suspicious/noFallthroughSwitchClause: we want to go to the default case
				case charCode.doubleQuote: {
					if (this.inTag) {
						++this.pos; // consume opening "
						const start = this.pos;
						while (
							this.pos < this.end &&
							this.text.charCodeAt(this.pos) !== charCode.doubleQuote
						) {
							++this.pos;
						}

						++this.pos; // consume closing "
						this.tokenValueStart = start;
						this.tokenValueEnd = this.pos;
						// this.tokenValue = this.text.substring(start, this.pos);

						// biome-ignore lint/suspicious/noAssignInExpressions: ok here
						return (this.token = tokenKind.attributeValue);
					}
					// fall-through
				}
				default:
					if (this.inTag) {
						if (isIdentifierStart(ch)) {
							const identifierStart = this.pos;
							++this.pos;
							while (
								this.pos < this.end &&
								// biome-ignore lint/suspicious/noAssignInExpressions: ok here
								isIdentifierPart((ch = this.text.charCodeAt(this.pos)))
							) {
								++this.pos;
							}

							this.tokenValueStart = identifierStart;
							this.tokenValueEnd = this.pos;
							// this.tokenValue = this.text.substring(identifierStart, this.pos);

							// biome-ignore lint/suspicious/noAssignInExpressions: ok here
							return (this.token = tokenKind.identifier);
						}
						++this.pos;
						continue;
					} else {
						// Read text node
						let tokenValueStart = this.pos;
						while (isWhitespace(this.text.charCodeAt(this.pos))) {
							++tokenValueStart;
						}
						// TODO: First element gets cut off

						while (
							this.pos < this.end &&
							this.text.charCodeAt(this.pos) !== charCode.lessThan
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
							continue;
						}

						this.tokenValueStart = tokenValueStart;
						this.tokenValueEnd = tokenValueEnd;

						// const value = this.text.substring(tokenValueStart, this.pos).trim();
						// if (value === "") {
						// 	continue;
						// }
						// this.tokenValue = value;

						// biome-ignore lint/suspicious/noAssignInExpressions: ok here
						return (this.token = tokenKind.identifier);
					}
			}
		}
	}
}

function isIdentifierStart(ch: number) {
	return (
		(ch >= charCode.A && ch <= charCode.Z) ||
		(ch >= charCode.a && ch <= charCode.z) ||
		ch === charCode._
	);
}

function isIdentifierPart(ch: number) {
	return (
		(ch >= charCode.A && ch <= charCode.Z) ||
		(ch >= charCode.a && ch <= charCode.z) ||
		ch === charCode._
	);
}
function isWhitespace(ch: number) {
	return (
		ch === charCode.space ||
		ch === charCode.tab ||
		ch === charCode.lineFeed ||
		ch === charCode.carriageReturn ||
		ch === charCode.verticalTab ||
		ch === charCode.formFeed ||
		ch === charCode.nonBreakingSpace ||
		ch === charCode.lineSeparator ||
		ch === charCode.paragraphSeparator ||
		ch === charCode.nextLine
	);
}

export const tokenKind = {
	eof: 0,
	startTag: 1,
	endTag: 2,
	startClosingTag: 3, // </
	endSelfClosing: 4, // />
	identifier: 5,
	equals: 6, // =
	attributeValue: 7,
	textContent: 8,
};

const charCode = {
	lineFeed: 0x0a, // \n
	carriageReturn: 0x0d, // \r
	lineSeparator: 0x2028,
	paragraphSeparator: 0x2029,
	nextLine: 0x85,
	tab: 0x09, // \t
	verticalTab: 0x0b, // \v
	formFeed: 0x0c, // \f
	space: 0x0020, // " "
	nonBreakingSpace: 0x00a0, //

	greaterThan: 0x3e, // >
	lessThan: 0x3c, // <
	slash: 0x2f, // /
	exclamationMark: 33,
	questionMark: 63,
	minus: 0x2d,

	equals: 0x3d, // =
	doubleQuote: 0x22, // "

	A: 0x41,
	Z: 0x5a,
	a: 0x61,
	z: 0x7a,
	_: 0x5f,
};

export function scanExpected(scanner: Scanner, expected: number) {
	if (scanner.scan() !== expected) {
		throw new Error(
			`Wrong token, expected: ${expected}, got: ${scanner.token}`,
		);
	}
}

export function skipAttributes(scanner: Scanner) {
	// parse until opening tag is terminated
	do {
		scanner.scan();

		// skip attributes
		if (scanner.token === tokenKind.identifier) {
			scanExpected(scanner, tokenKind.equals);
			scanExpected(scanner, tokenKind.attributeValue);
			continue;
		}
		if (scanner.token === tokenKind.endTag) {
			break;
		}
		throw new Error(`Unexpected token: ${scanner.token}`);
		// biome-ignore lint/correctness/noConstantCondition: see above
	} while (true);
}

export function expectIdentifier(scanner: Scanner, identifier: string) {
	scanExpected(scanner, tokenKind.identifier);
	if (scanner.tokenValue !== identifier) {
		throw new Error(
			`Expected closing tag for identifier: ${identifier}, got: ${scanner.tokenValue}`,
		);
	}
}
export function expectClosingTag(scanner: Scanner, tagName: string) {
	scanExpected(scanner, tokenKind.startClosingTag);
	expectIdentifier(scanner, tagName);
	scanExpected(scanner, tokenKind.endTag);
}
export function parseStringTag(scanner: Scanner, tagName: string): string {
	skipAttributes(scanner);
	scanner.scan(); // consume >
	if (scanner.token === tokenKind.startClosingTag) {
		expectIdentifier(scanner, tagName);
		scanExpected(scanner, tokenKind.endTag);
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
