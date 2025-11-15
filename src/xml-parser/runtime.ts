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
	parseIgnoredTag(identifierId: number): void {
		this.expectIdentifier(identifierId);

		if (this.token === TokenKind.endSelfClosing) {
			this.nextToken();
			return;
		}

		this.parseExpected(TokenKind.endTag);

		if (this.token === TokenKind.startClosingTag) {
			this.nextToken();
			this.expectIdentifier(identifierId);
			this.parseExpected(TokenKind.endTag);
			return;
		}

		if (this.token !== TokenKind.textNode) {
			throw new Error(`Expected text content for tag "${identifierId}".`);
		}

		this.nextToken();
		this.parseClosingTag(identifierId);
	}

	/** Assumes {@link TokenKind.startTag} was already consumed. */
	parseStringTag(identifierId: number): string | undefined {
		this.expectIdentifier(identifierId);

		if (this.token === TokenKind.endSelfClosing) {
			this.nextToken();
			return undefined;
		}

		this.parseExpected(TokenKind.endTag);

		if (this.token === TokenKind.startClosingTag) {
			this.nextToken();
			this.expectIdentifier(identifierId);
			this.parseExpected(TokenKind.endTag);
			return "";
		}

		if (this.token !== TokenKind.textNode) {
			throw new Error(`Expected text content for tag "${identifierId}".`);
		}

		const value = this.scanner.getTokenValueDecoded();
		this.nextToken();

		this.parseClosingTag(identifierId);
		return value;
	}

	/** Assumes {@link TokenKind.startTag} was already consumed. */
	parseDateTag(identifierId: number): Date | undefined {
		const value = this.parseStringTag(identifierId);
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
	parseIntegerTag(identifierId: number): number | undefined {
		const value = this.parseStringTag(identifierId);
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
	parseBooleanTag(identifierId: number): boolean | undefined {
		const value = this.parseStringTag(identifierId);
		return value === undefined
			? undefined
			: value === "true"
				? true
				: value === "false"
					? false
					: undefined;
	}

	//#endregion

	parseClosingTag(identifierId: number): void {
		this.parseExpected(TokenKind.startClosingTag);
		this.expectIdentifier(identifierId);
		this.parseExpected(TokenKind.endTag);
	}

	parseExpected(expected: TokenKind): void {
		if (this.token !== expected) {
			throw new Error(`Wrong token, expected: ${expected}, got: ${this.token}`);
		}
		this.nextToken();
	}

	expectIdentifier(identifierId: number): void {
		this.token = this.scanner.expectIdentifier(identifierId);
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
	text: Buffer;
	#native: {
		init_scanner: (textLength: number) => void;
		scan_token: () => TokenKind;
		get_token_value_end: () => number;
		get_token_value_start: () => number;
		expect_identifier: (identifierId: number) => number;
		get_identifier_id: () => number;
	};

	getTokenValueEncoded() {
		return textDecoder.decode(
			this.text.subarray(
				this.#native.get_token_value_start(),
				this.#native.get_token_value_end(),
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
				// TODO: use WASM globals for text data
			},
		});
		return new Scanner(instance, memory);
	}

	constructor(instance: WebAssembly.Instance, memory: WasmMemoryReference) {
		this.#native = instance.exports as any;
		// this.memoryBuffer = new DataView(memory.memory.buffer);
		this.text = Buffer.from(memory.memory.buffer.slice(0, memory.byteLength));
	}

	reset() {
		this.#native.init_scanner(this.text.byteLength);
	}

	scan(): TokenKind {
		return this.#native.scan_token();
	}

	getIdentifierId(): number {
		return this.#native.get_identifier_id();
	}

	expectIdentifier(identifierId: number): number {
		const nextTokenOrError = this.#native.expect_identifier(identifierId);
		if (nextTokenOrError >= 64) {
			throw new Error(
				`Expected identifier id: ${identifierId} ${nextTokenOrError}`,
			);
		}
		// console.log("expectIdentifier", identifierId, nextTokenOrError);
		return nextTokenOrError;
	}
}
