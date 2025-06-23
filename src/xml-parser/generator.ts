import { TokenKind } from "./runtime.ts";

function emitParser(
	spec: ParseSpec<string> | RootSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	if (globals.has(spec)) {
		return "";
	}

	switch (spec.type) {
		case "string":
		case "integer":
		case "boolean":
		case "date":
			return ""; // these are built-in
		case "object":
			return emitObjectParser(spec, tagName, globals);
		case "array":
			return emitParser(spec.item, tagName, globals);
		case "root":
			return emitRootParser(spec, globals);
	}
}
function emitParserCall(
	spec: ParseSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	switch (spec.type) {
		case "string":
			return `(parseStringTag(scanner, ${asLiteral(tagName)})${spec.emptyIsAbsent ? " || undefined" : ""})`;
		case "integer":
			return `parseIntegerTag(scanner, ${asLiteral(tagName)})`;
		case "boolean":
			return `parseBooleanTag(scanner, ${asLiteral(tagName)})`;
		case "date":
			return `parseDateTag(scanner, ${asLiteral(tagName)})`;
		case "object":
			return `${globals.get(spec)}(scanner)`;
		case "array":
			return ""; // arrays handled differently
	}
}

function emitChildParsers(
	spec: RootSpec<string> | ObjectSpec<string>,
	globals: Map<unknown, string>,
): string {
	let code = "";
	for (const [childName, childSpec] of Object.entries(spec.children)) {
		const childTagName = childSpec.tagName ?? childName;
		code += emitParser(childSpec, childTagName, globals);
	}
	return code;
}

function emitChildFieldInit(children: Record<string, ParseSpec<string>>) {
	return Object.entries(children)
		.map(
			([n, childSpec]) =>
				`${n}: ${
					childSpec.type === "array" && childSpec.defaultEmpty
						? "[]"
						: childSpec.type === "boolean" &&
								typeof childSpec.defaultValue === "boolean" &&
								!childSpec.optional
							? childSpec.defaultValue.toString()
							: childSpec.type === "string" &&
									typeof childSpec.defaultValue === "string" &&
									!childSpec.optional
								? childSpec.defaultValue
								: childSpec.type === "integer" &&
										typeof childSpec.defaultValue === "number" &&
										!childSpec.optional
									? childSpec.defaultValue.toString()
									: childSpec.type === "date" &&
											childSpec.defaultValue instanceof Date &&
											!childSpec.optional
										? `new Date("${childSpec.defaultValue.toISOString()}")`
										: "undefined"
				},`,
		)
		.join("\n\t\t");
}

function emitResultAssignment(
	resultField: string,
	spec: ParseSpec<string>,
	fieldName: string,
	globals: Map<unknown, string>,
) {
	return spec.type === "array"
		? spec.defaultEmpty
			? `${resultField}.${fieldName}.push(${emitParserCall(spec.item, spec.tagName ?? fieldName, globals)})`
			: `(${resultField}.${fieldName} ??= []).push(${emitParserCall(spec.item, spec.tagName ?? fieldName, globals)})`
		: `${resultField}.${fieldName} = ${emitParserCall(spec, spec.tagName ?? fieldName, globals)}`;
}

function emitRootParser(
	spec: RootSpec<string>,
	globals: Map<unknown, string>,
): string {
	const parseFn = `root_parse_fn_${globals.size}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return `
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${emitChildFieldInit(children)}
	};

	scanner.scan(); // prime scanner

	if (scanner.token === ${TokenKind.preamble}) {
		scanner.scan();
	}

	while (true) {
		scanner.scan();
		switch (scanner.token) {
			case ${TokenKind.eof}: {
				${Object.entries(children)
					.map(([name, childSpec]) =>
						childSpec.optional ||
						(childSpec.type === "array" && childSpec.defaultEmpty)
							? undefined
							: `if (res.${name} === undefined) throw new TypeError(\`Value for field "${name}" was required but not present (expected as tag name "${childSpec.tagName ?? name}").\`);`,
					)
					.filter(s => !!s)
					.join("\n\t\t\t\t")}
				return res;
			}
			case ${TokenKind.startTag}: {
				scanExpected(scanner, ${TokenKind.identifier});
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${emitResultAssignment("res", childSpec, name, globals)};
						break;`,
						)
						.join("\n\t\t\t\t\t")}
					default:
						throw new Error(\`Unexpected tag identifier: \${scanner.tokenValue}\`);
				}
				break;
			}
			default:
				throw new Error(\`Unhandled token kind: \${scanner.token}\`);
		}
	}
}
`.trimStart();
}
function emitObjectParser(
	spec: ObjectSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	const parseFn = `fn_${globals.size}_${tagName}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return `
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${emitChildFieldInit(children)}
	};

	skipAttributes(scanner);

	while (true) {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case ${TokenKind.startClosingTag}: {
				expectIdentifier(scanner, ${asLiteral(tagName)});
				scanExpected(scanner, ${TokenKind.endTag});
				${Object.entries(children)
					.map(([name, childSpec]) =>
						childSpec.optional ||
						(childSpec.type === "array" && childSpec.defaultEmpty)
							? undefined
							: `if (res.${name} === undefined) throw new TypeError(\`Value for field "${name}" was required but not present (expected as tag name "${childSpec.tagName ?? name}").\`);`,
					)
					.filter(s => !!s)
					.join("\n\t\t\t\t")}
				return res;
			}
			case ${TokenKind.startTag}: {
				scanExpected(scanner, ${TokenKind.identifier});
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${emitResultAssignment("res", childSpec, name, globals)};
						break;`,
						)
						.join("\n\t\t\t\t\t")}
					default:
						throw new Error(\`Unexpected tag identifier: \${scanner.tokenValue}\`);
				}
				break;
			}
			default:
				throw new Error(\`Unhandled token kind: \${scanner.token}\`);
		}
	}
}
`.trimStart();
}
function asLiteral(value: string): string {
	return `"${value}"`; // TODO: Escaping
}
function _asIdentifier(value: string): string {
	return value; // TODO: Escaping
}

type ParseSpec<T extends string> =
	| ObjectSpec<T>
	| ArraySpec<T>
	| StringSpec
	| BooleanSpec
	| IntegerSpec
	| DateSpec;

type RootSpec<T extends string> = {
	type: "root";
	tagName?: string;
	children: Record<T, ParseSpec<string>>;
};
type ObjectSpec<T extends string> = {
	type: "object";
	tagName?: string;
	optional?: boolean;
	children: Record<T, ParseSpec<string>>;
};
type ArraySpec<T extends string> = {
	type: "array";
	tagName?: string;
	optional?: boolean;
	defaultEmpty?: boolean;
	item: ParseSpec<T>;
};
type StringSpec = {
	type: "string";
	tagName?: string;
	optional?: boolean;
	defaultValue?: string;
	emptyIsAbsent?: boolean;
};
type BooleanSpec = {
	type: "boolean";
	tagName?: string;
	optional?: boolean;
	defaultValue?: boolean;
};
type IntegerSpec = {
	type: "integer";
	tagName?: string;
	optional?: boolean;
	defaultValue?: number;
};
type DateSpec = {
	type: "date";
	tagName?: string;
	optional?: boolean;
	defaultValue?: Date;
};

/*
type ParsedRoot<V extends Record<string, ParseSpec<string>>, T extends RootSpec<V>> = {
	[k in keyof T["children"]]: ParsedType<T["children"][k]>;
};

type ParsedObject<V extends Record<string, ParseSpec<string>>, T extends ObjectSpec<V>> = {
	[k in keyof T["children"]]: ParsedType<T["children"][k]>;
};

type ParsedType<T extends ParseSpec<string>> = T extends StringSpec
	? string
	: T extends BooleanSpec
		? boolean
		: T extends IntegerSpec
			? number
			: T extends DateSpec
				? Date
				: T extends ObjectSpec<infer U>
					? ParsedObject<U , ObjectSpec<U>>
					: never;

function buildParser<T extends Record<string, ParseSpec<string>>, V extends T>(
	rootSpec: RootSpec<T>,
): Parser<ParsedRoot<T, RootSpec<V>>> {
	throw new Error("Not implemented");
}
*/

type Parser<T> = (text: string) => T;

function buildParser<T extends string>(rootSpec: RootSpec<T>): Parser<unknown> {
	const globals = new Map();
	const parsingCode = emitParser(rootSpec, "", globals);
	const rootParseFunctionName = globals.get(rootSpec);
	globals.clear(); // make sure we clear all references (even though this map won't survive past this function)

	console.log(`
import { Scanner, scanExpected, skipAttributes, expectIdentifier, parseStringTag, parseDateTag, parseIntegerTag, parseBooleanTag} from "./runtime.ts";
${parsingCode}
export default function parse(text) {
	return ${rootParseFunctionName}(new Scanner(text));
}`);

	throw new Error("Not implemented");
}
const _parser = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "ListPartsResult",
			children: {
				bucket: { type: "string", tagName: "Bucket" },
				key: { type: "string", tagName: "Key" },
				uploadId: { type: "string", tagName: "UploadId" },
				storageClass: { type: "string", tagName: "StorageClass" },
				checksumAlgorithm: {
					type: "string",
					tagName: "ChecksumAlgorithm",
					optional: true,
					emptyIsAbsent: true,
				},
				checksumType: {
					type: "string",
					tagName: "ChecksumType",
					optional: true,
					emptyIsAbsent: true,
				},
				partNumberMarker: { type: "integer", tagName: "PartNumberMarker" },
				nextPartNumberMarker: {
					type: "integer",
					tagName: "NextPartNumberMarker",
				},
				maxParts: { type: "integer", tagName: "MaxParts" },
				isTruncated: {
					type: "boolean",
					tagName: "IsTruncated",
					defaultValue: false,
				},
				initiator: {
					type: "object",
					tagName: "Initiator",
					children: {
						displayName: { type: "string", tagName: "DisplayName" },
						id: { type: "string", tagName: "ID" },
					},
				},
				owner: {
					type: "object",
					tagName: "Owner",
					children: {
						displayName: { type: "string", tagName: "DisplayName" },
						id: { type: "string", tagName: "ID" },
					},
				},
				parts: {
					type: "array",
					tagName: "Part",
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							etag: { type: "string", tagName: "ETag" },
							lastModified: { type: "date", tagName: "LastModified" },
							partNumber: { type: "integer", tagName: "PartNumber" },
							size: { type: "integer", tagName: "Size" },
						},
					},
				},
			},
		},
	},
});

/*
const x = emitParseFunction(rootSpec);
console.log(x);
console.log(`console.log("parse result:", parse(\`${text}\`))`);
*/
