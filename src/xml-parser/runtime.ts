/** biome-ignore-all lint/suspicious/noAssignInExpressions: ok here */

import compileWasmScanner from "./scanner.zig?compile";

const wasmScanner = (await compileWasmScanner()) as WebAssembly.Module;

export class Parser {
	scanner: Scanner;
	token!: TokenKind;

	nextToken = () => {
		this.token = this.scanner.scan();
	};

	constructor(scanner: Scanner) {
		this.scanner = scanner;
		this.nextToken();
	}

	static async create(memory: WasmMemoryReference): Promise<Parser> {
		return new Parser(await Scanner.create(memory));
	}

	//#region primitives

	/** Assumes {@link TokenKind.startTag} was already consumed. */
	parseIgnoredTag(tagName: string): void {
		this.parseIdentifier(tagName);

		if (this.token === TokenKind.endSelfClosing) {
			this.nextToken();
			return;
		}

		this.parseExpected(TokenKind.endTag);

		if (this.token === TokenKind.startClosingTag) {
			this.nextToken();
			this.parseIdentifier(tagName);
			this.parseExpected(TokenKind.endTag);
			return;
		}

		if (this.token !== TokenKind.textNode) {
			throw new Error(`Expected text content for tag "${tagName}".`);
		}

		this.nextToken();
		this.parseClosingTag(tagName);
	}

	/** Assumes {@link TokenKind.startTag} was already consumed. */
	parseStringTag(tagName: string): string | undefined {
		this.parseIdentifier(tagName);

		if (this.token === TokenKind.endSelfClosing) {
			this.nextToken();
			return undefined;
		}

		this.parseExpected(TokenKind.endTag);

		if (this.token === TokenKind.startClosingTag) {
			this.nextToken();
			this.parseIdentifier(tagName);
			this.parseExpected(TokenKind.endTag);
			return "";
		}

		if (this.token !== TokenKind.textNode) {
			throw new Error(`Expected text content for tag "${tagName}".`);
		}

		const value = this.scanner.getTokenValueDecoded();
		this.nextToken();

		this.parseClosingTag(tagName);
		return value;
	}

	/** Assumes {@link TokenKind.startTag} was already consumed. */
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

	/** Assumes {@link TokenKind.startTag} was already consumed. */
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

	/** Assumes {@link TokenKind.startTag} was already consumed. */
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
		this.parseExpected(TokenKind.startClosingTag);
		this.parseIdentifier(tagName);
		this.parseExpected(TokenKind.endTag);
	}

	parseExpected(expected: TokenKind): void {
		if (this.token !== expected) {
			throw new Error(`Wrong token, expected: ${expected}, got: ${this.token}`);
		}
		this.nextToken();
	}

	parseIdentifier(identifier: string): void {
		if (this.token !== TokenKind.identifier) {
			throw new Error(
				`Wrong token, expected: ${TokenKind.identifier}, got: ${this.token}`,
			);
		}
		if (this.scanner.getTokenValueEncoded() !== identifier) {
			throw new Error(
				`Expected identifier: ${identifier}, got: ${this.scanner.getTokenValueEncoded()}`,
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
	eof = 0,
	startTag = 1, // <
	endTag = 2, // >
	startClosingTag = 3, // </
	endSelfClosing = 4, // />
	identifier = 5,
	textNode = 6,
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

const textDecoder = new TextDecoder();

export type WasmMemoryReference = {
	memory: WebAssembly.Memory;
	byteLength: number;
};

class Scanner {
	startPos: number;
	pos: number;
	end: number;
	text: Uint8Array;
	#memory: WebAssembly.Memory;
	#instance: WebAssembly.Instance;

	inTag = false;

	token = -1;

	tokenValueStart = -1;
	tokenValueEnd = -1;

	getTokenValueEncoded() {
		return textDecoder.decode(
			this.text.slice(this.tokenValueStart, this.tokenValueEnd),
		);
	}
	getTokenValueDecoded() {
		return this.getTokenValueEncoded().replace(
			entityPattern,
			m => entityMap[m as keyof typeof entityMap] ?? m,
		);
	}

	static async create(memory: WasmMemoryReference): Promise<Scanner> {
		const instance = await WebAssembly.instantiate(wasmScanner, {
			env: {
				memory: memory.memory,
			},
		});
		return new Scanner(instance, memory);
	}

	constructor(instance: WebAssembly.Instance, memory: WasmMemoryReference) {
		// Number(text); // collapse rope structure of V8
		this.startPos = 0;
		this.pos = 0;
		this.end = memory.byteLength;
		this.#memory = memory.memory;
		this.#instance = instance;
		this.text = new Uint8Array(this.#memory.buffer, 0, memory.byteLength);
		instance.exports.init_scanner(memory.byteLength);
	}

	scan(): TokenKind {
		const res = this.#instance.exports.scan_token();
		console.log("res", res);

		this.startPos = this.pos;
		while (true) {
			if (this.pos >= this.end) {
				return (this.token = TokenKind.eof);
			}

			const ch = this.text[this.pos];
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
						// equals are skipped in the handler for the identifier
						throw new Error(
							"Equals cannot appear in a tag without a leading identifier.",
						);
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
						switch (this.text[this.pos]) {
							case CharCode.slash:
								++this.pos;
								return (this.token = TokenKind.startClosingTag);
							case CharCode.questionMark:
								this.inTag = false;
								this.#skipPreamble();
								continue;
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
					if (!this.inTag) {
						const textNode = this.#scanTextNode();
						if (textNode === undefined) {
							continue;
						}
						return textNode;
					}

					++this.pos;
					if (this.pos < this.end) {
						const nextChar = this.text[this.pos];
						if (nextChar === CharCode.greaterThan) {
							++this.pos;
							return (this.token = TokenKind.endSelfClosing);
						}
					}
					return (this.token = TokenKind.endTag);

				case CharCode.doubleQuote: {
					if (this.inTag) {
						// quotes are skipped in the handler for the identifier
						throw new Error(
							"Double quotes cannot appear in a tag without a leading equals.",
						);
					}
					const textNode = this.#scanTextNode();
					if (textNode === undefined) {
						continue;
					}
					return textNode;
				}
				default:
					if (!this.inTag) {
						return this.#scanTextNode();
					}

					if (isIdentifierStart(ch)) {
						// We actually don't care about attributes, just skip them entirely in this case
						const token = this.#scanIdentifier();

						if (this.text[this.pos] === CharCode.equals) {
							++this.pos; // consume =
							if (this.text[this.pos] !== CharCode.doubleQuote) {
								throw new Error("Equals must be followed by a quoted string.");
							}
							this.skipQuotedString();
							continue;
						}
						return token;
					}
					continue;
			}
		}
	}

	#scanTextNode(): TokenKind.textNode {
		// Read text node
		let tokenValueStart = this.pos;
		while (isWhitespace(this.text[this.pos])) {
			++tokenValueStart;
		}

		this.pos = this.text.indexOf("<".charCodeAt(0), tokenValueStart + 1);
		if (this.pos === -1) {
			throw new Error("Unterminated text node.");
		}

		let tokenValueEnd = this.pos;
		do {
			--tokenValueEnd;
		} while (isWhitespace(this.text[tokenValueEnd]));
		++tokenValueEnd;

		this.tokenValueStart = tokenValueStart;
		this.tokenValueEnd = tokenValueEnd;
		return (this.token = TokenKind.textNode);
	}

	skipQuotedString() {
		++this.pos; // consume opening "

		this.pos = this.text.indexOf('"'.charCodeAt(0), this.pos);
		if (this.pos === -1) {
			throw new Error("Unterminated quote.");
		}

		++this.pos; // consume closing "
	}

	#skipIdentifier(): void {
		++this.pos; // consume first char
		while (this.pos < this.end && isIdentifierPart(this.text[this.pos])) {
			++this.pos;
		}
	}

	#scanIdentifier(): TokenKind.identifier {
		const identifierStart = this.pos;
		this.#skipIdentifier();
		this.tokenValueStart = identifierStart;
		this.tokenValueEnd = this.pos;
		return (this.token = TokenKind.identifier);
	}

	#skipPreamble(): void {
		++this.pos; // consume ?

		const closingIndex = this.text.indexOf(">".charCodeAt(0), this.pos);
		if (closingIndex === -1) {
			throw new Error("Unterminated XML preamble.");
		}
		const questionMarkIndex = closingIndex - 1;
		if (this.text[questionMarkIndex] !== CharCode.questionMark) {
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
