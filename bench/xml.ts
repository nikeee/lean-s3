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

function emitParseFunction(spec) {
	const globals = new Map();
	const parsingCode = emitParser(spec, "", globals);
	const rootParseFunctionName = globals.get(spec);
	return `
${parsingCode}
function parse(text) {
	const scanner = new Scanner(text);
	return ${rootParseFunctionName}(scanner);
}`;
}

function emitParser(
	spec: ParseSpec | RootSpec,
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
	spec: ParseSpec,
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
	spec: RootSpec | ObjectSpec,
	globals: Map<unknown, string>,
): string {
	let code = "";
	for (const [childName, childSpec] of Object.entries(spec.children)) {
		const childTagName = childSpec.tagName ?? childName;
		code += emitParser(childSpec, childTagName, globals);
	}
	return code;
}
function emitRootParser(spec: RootSpec, globals: Map<unknown, string>): string {
	const parseFn = `root_parse_fn_${globals.size}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return (
		`
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${Object.keys(children)
			.map(n => `${n}: undefined,`)
			.join("\n\t\t")}
	};

	do {
		scanner.scan();
		switch (scanner.token) {
			case tokenKind.eof: return res;
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${
							childSpec.type === "array"
								? `(res.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
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
	spec: ObjectSpec,
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
		${Object.keys(children)
			.map(n => `${n}: undefined,`)
			.join("\n\t\t")}
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, ${asLiteral(tagName)});
				scanExpected(scanner, tokenKind.endTag);
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
								? `(res.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
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

type ParseSpec =
	| ObjectSpec
	| ArraySpec
	| StringSpec
	| BooleanSpec
	| IntegerSpec
	| DateSpec;

type RootSpec = {
	type: "root";
	tagName?: string;
	children: Record<string, ParseSpec>;
};
type ObjectSpec = {
	type: "object";
	tagName?: string;
	children: Record<string, ParseSpec>;
};
type ArraySpec = {
	type: "array";
	tagName?: string;
	item: ParseSpec;
};
type StringSpec = {
	type: "string";
	tagName?: string;
};
type BooleanSpec = {
	type: "boolean";
	tagName?: string;
};
type IntegerSpec = {
	type: "integer";
	tagName?: string;
};
type DateSpec = {
	type: "date";
	tagName?: string;
};

const rootSpec: RootSpec = {
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
};

const x = emitParseFunction(rootSpec);
console.log(
	`import { Scanner, tokenKind, scanExpected, skipAttributes, expectIdentifier, expectClosingTag, parseStringTag, parseDateTag, parseIntegerTag, parseBooleanTag} from "./parser-runtime.ts";`,
);
console.log(x);
console.log(`console.log("parse result:", parse(\`${text}\`))`);
