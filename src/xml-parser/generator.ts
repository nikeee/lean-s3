const text = `<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test-bucket</Bucket><Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key><UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><ETag>"4715e35cf900ae14837e3c098e87d522"</ETag><LastModified>2025-06-20T13:58:01.000Z</LastModified><PartNumber>1</PartNumber><Size>6291456</Size></Part><Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`;

/*
import { summary, group, bench, run } from "mitata";
import { XMLParser } from "fast-xml-parser";

const out = process.stdout;

function printToken(scanner: Scanner) {
	switch (scanner.token) {
		case tokenKind.eof:
			out.write("[EOF]\n");
			break;
		case tokenKind.startTag:
			out.write("[<]");
			break;
		case tokenKind.endTag:
			out.write("[>]");
			break;
		case tokenKind.endSelfClosing:
			out.write("[/>]");
			break;
		case tokenKind.startClosingTag:
			out.write("[</]");
			break;
		case tokenKind.identifier:
			out.write("[");
			out.write(scanner.tokenValue!);
			out.write("]");
			break;
		case tokenKind.equals:
			out.write("[=]");
			break;
		case tokenKind.attributeValue:
			out.write("[");
			out.write(scanner.tokenValue!);
			out.write("]");
			break;
		default:
			throw new Error("Token not supported: " + scanner.token);
	}
}

summary(() => {
	group(() => {
		bench("parser", () => {
			for (let i = 0; i < 1000; ++i) {
				parseListPartsResult(text);
			}
		});

		bench("fast-xml-parser", () => {
			for (let i = 0; i < 1000; ++i) {
				const x = new XMLParser({
					ignoreAttributes: true,
					isArray: tagName => tagName === "Part",
				});
				x.parse(text);
			}
		});
	});
});
*/

// await run();

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
			return `parseStringTag(scanner, ${asLiteral(tagName)})`;
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
function emitRootParser(
	spec: RootSpec<string>,
	globals: Map<unknown, string>,
): string {
	const parseFn = `root_parse_fn_${globals.size}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return (
		`
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${Object.entries(children)
			.map(
				([n, childSpec]) =>
					`${n}: ${childSpec.type === "array" && childSpec.defaultEmpty ? "[]" : undefined},`,
			)
			.join("\n\t\t")}
	};
	scanner.skipPreamble();

	do {
		scanner.scan();
		switch (scanner.token) {
			case tokenKind.eof: {
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
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${
							childSpec.type === "array"
								? childSpec.defaultEmpty
									? `res.${name}.push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
									: `(res.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
								: `res.${name} = ${emitParserCall(childSpec, childSpec.tagName ?? name, globals)}`
						};
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
	} while (true);
}`.trim() + "\n"
	);
}
function emitObjectParser(
	spec: ObjectSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	const parseFn = `fn_${globals.size}_${tagName}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return (
		`
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${Object.entries(children)
			.map(
				([n, childSpec]) =>
					`${n}: ${childSpec.type === "array" && childSpec.defaultEmpty ? "[]" : undefined},`,
			)
			.join("\n\t\t")}
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, ${asLiteral(tagName)});
				scanExpected(scanner, tokenKind.endTag);
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
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${
							childSpec.type === "array"
								? childSpec.defaultEmpty
									? `res.${name}.push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
									: `(res.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
								: `res.${name} = ${emitParserCall(childSpec, childSpec.tagName ?? name, globals)}`
						};
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
	} while (true);
}
`.trim() + "\n"
	);
}
function asLiteral(value: string): string {
	return `"${value}"`; // TODO: Escaping
}
function asIdentifier(value: string): string {
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
};
type BooleanSpec = {
	type: "boolean";
	tagName?: string;
	optional?: boolean;
};
type IntegerSpec = {
	type: "integer";
	tagName?: string;
	optional?: boolean;
};
type DateSpec = {
	type: "date";
	tagName?: string;
	optional?: boolean;
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
import { Scanner, tokenKind, scanExpected, skipAttributes, expectIdentifier, expectClosingTag, parseStringTag, parseDateTag, parseIntegerTag, parseBooleanTag} from "./runtime.ts";
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
				},
				checksumType: {
					type: "string",
					tagName: "ChecksumType",
					optional: true,
				},
				partNumberMarker: { type: "integer", tagName: "PartNumberMarker" },
				nextPartNumberMarker: {
					type: "integer",
					tagName: "NextPartNumberMarker",
				},
				maxParts: { type: "integer", tagName: "MaxParts" },
				isTruncated: { type: "boolean", tagName: "IsTruncated" },
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
