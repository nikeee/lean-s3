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

const textDecoder = new TextDecoder();

export type WasmMemoryReference = {
	memory: WebAssembly.Memory;
	byteLength: number;
};

export class Scanner {
	text: Uint8Array;
	#memory: WebAssembly.Memory;
	#instance: WebAssembly.Instance;

	token = -1;

	getTokenValueEncoded() {
		return textDecoder.decode(
			this.text.slice(
				this.#instance.exports.get_token_value_start(),
				this.#instance.exports.get_token_value_end(),
			),
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
		this.#memory = memory.memory;
		this.#instance = instance;
		this.text = new Uint8Array(this.#memory.buffer, 0, memory.byteLength);
		instance.exports.init_scanner(memory.byteLength);
	}

	scan(): TokenKind {
		return this.#instance.exports.scan_token();
		// const res = this.#instance.exports.scan_token();
		// console.log("res", res);
		// return res;
	}
}
