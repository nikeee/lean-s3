import { summary, group, bench, run } from "mitata";
import { XMLParser } from "fast-xml-parser";

const text = `<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test-bucket</Bucket><Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key><UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><ETag>"4715e35cf900ae14837e3c098e87d522"</ETag><LastModified>2025-06-20T13:58:01.000Z</LastModified><PartNumber>1</PartNumber><Size>6291456</Size></Part><Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`;

export function parseListPartsResult(text: string) {
	const scanner = new Scanner(text);
	scanExpected(scanner, tokenKind.startTag);

	scanExpected(scanner, tokenKind.identifier);
	if (scanner.tokenValue !== "ListPartsResult") {
		throw new Error("Expected identifier: " + "ListPartsResult");
	}

	// Init structure entirely, so v8 can create a single hidden class
	const nodeResult = {
		Bucket: undefined,
		Key: undefined,
		UploadId: undefined,
		PartNumberMarker: undefined,
		NextPartNumberMarker: undefined,
		MaxParts: undefined,
		IsTruncated: undefined,
		Part: undefined,
		Initiator: undefined,
		Owner: undefined,
		StorageClass: undefined,
	};

	skipAttributes(scanner);
	do {
		scanner.scan(); // consume >
		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "ListPartsResult");
				scanExpected(scanner, tokenKind.endTag);
				return nodeResult;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "Bucket":
						nodeResult.Bucket = parseStringTag(scanner, "Bucket");
						break;
					case "Key":
						nodeResult.Key = parseStringTag(scanner, "Key");
						break;
					case "UploadId":
						nodeResult.UploadId = parseStringTag(scanner, "UploadId");
						break;
					case "PartNumberMarker":
						nodeResult.PartNumberMarker = parseIntegerTag(
							scanner,
							"PartNumberMarker",
						);
						break;
					case "NextPartNumberMarker":
						nodeResult.NextPartNumberMarker = parseIntegerTag(
							scanner,
							"NextPartNumberMarker",
						);
						break;
					case "MaxParts":
						nodeResult.MaxParts = parseIntegerTag(scanner, "MaxParts");
						break;
					case "IsTruncated":
						nodeResult.IsTruncated = parseBooleanTag(scanner, "IsTruncated");
						break;
					case "Part":
						(nodeResult.Part ??= []).push(parsePart(scanner));
						break;
					case "Initiator":
						nodeResult.Initiator = parseOwnerOrInitiator(scanner, "Initiator");
						break;
					case "Owner":
						nodeResult.Owner = parseOwnerOrInitiator(scanner, "Owner");
						break;
					case "StorageClass":
						nodeResult.StorageClass = parseStringTag(scanner, "StorageClass");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
		// biome-ignore lint/correctness/noConstantCondition: see above
	} while (true);
}

function parseOwnerOrInitiator(scanner: Scanner, name: string) {
	const nodeResult = {
		DisplayName: undefined,
		ID: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, name);
				scanExpected(scanner, tokenKind.endTag);
				return nodeResult;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "DisplayName":
						nodeResult.DisplayName = parseStringTag(scanner, "DisplayName");
						break;
					case "ID":
						nodeResult.ID = parseStringTag(scanner, "ID");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}

function parsePart(scanner: Scanner) {
	const nodeResult = {
		ETag: undefined,
		LastModified: undefined,
		PartNumber: undefined,
		Size: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "Part");
				scanExpected(scanner, tokenKind.endTag);
				return nodeResult;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "ETag":
						nodeResult.ETag = parseStringTag(scanner, "ETag");
						break;
					case "LastModified":
						nodeResult.LastModified = parseDateTag(scanner, "LastModified");
						break;
					case "PartNumber":
						nodeResult.PartNumber = parseIntegerTag(scanner, "PartNumber");
						break;
					case "Size":
						nodeResult.Size = parseIntegerTag(scanner, "Size");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}

// console.log(text);

const shortText = `
	<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>test-bucket</Bucket>
    <Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key>
    <UploadId>
        tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId>
    <PartNumberMarker>0</PartNumberMarker>
    <NextPartNumberMarker>3</NextPartNumberMarker>
    <MaxParts>1000</MaxParts>
    <IsTruncated>false</IsTruncated>
    <Initiator>
        <DisplayName>webfile</DisplayName>
        <ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID>
    </Initiator>
    <Owner>
        <DisplayName>webfile</DisplayName>
        <ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID>
    </Owner>
    <StorageClass>STANDARD</StorageClass>
</ListPartsResult>
`;

// console.log("Parsing");
// const p = parseListPartsResult(text);
// console.log("End parsing", p);

// const x = new XMLParser({
// 	ignoreAttributes: true,
// });
// console.log("fxml", x.parse(text).ListPartsResult);

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
/*
const tokenStream = [];
do {
	tokenStream.push(scanner.scan());
	printToken(scanner);
} while (scanner.token !== tokenKind.eof);
console.log(tokenStream);
*/

summary(() => {
	group(() => {
		/*
		const scanner = new Scanner(text);
		bench("tokenize", () => {
			const tokenStream = [];
			do {
				tokenStream.push(scanner.scan());
			} while (scanner.token !== tokenKind.eof);
		});
		*/

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

function emitParser(spec, tagName, globals: Map<unknown, string>): string {
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
		default:
			throw new Error(`Unsupported spec type: ${spec.type}`);
	}
}
function emitParserCall(
	spec,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	switch (spec.type) {
		case "string":
			return `parseStringTag(scanner, "${tagName}")`;
		case "integer":
			return `parseIntegerTag(scanner, "${tagName}")`;
		case "boolean":
			return `parseBooleanTag(scanner, "${tagName}")`;
		case "date":
			return `parseDateTag(scanner, "${tagName}")`;
		case "object":
			return `${globals.get(spec)}(scanner)`;
		case "array":
			return ""; // arrays handled differently
		default:
			throw new Error(`Unsupported spec type: ${spec.type}`);
	}
}

function emitChildParsers(spec, globals: Map<unknown, string>) {
	let code = "";
	for (const [childName, childSpec] of Object.entries(spec.children)) {
		const childTagName = childSpec.tagName ?? childName;
		code += emitParser(childSpec, childTagName, globals);
	}
	return code;
}
function emitRootParser(spec, globals: Map<unknown, string>): string {
	const parseFn = `root_parse_fn_${globals.size}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return `
${emitChildParsers(spec, globals)}
function ${parseFn}(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const nodeResult = {
		${Object.keys(children)
			.map(n => `${n}: undefined,`)
			.join("\n\t\t")}
	};

	do {
		scanner.scan();
		switch (scanner.token) {
			case tokenKind.eof: return nodeResult;
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case "${childSpec.tagName ?? name}":
						${
							childSpec.type === "array"
								? `(nodeResult.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
								: `nodeResult.${name} = ${emitParserCall(childSpec, childSpec.tagName ?? name, globals)}`
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
}`.trim() + "\n";
}
function emitObjectParser(
	spec,
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
	const nodeResult = {
		${Object.keys(children)
			.map(n => `${n}: undefined,`)
			.join("\n\t\t")}
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "${tagName}");
				scanExpected(scanner, tokenKind.endTag);
				return nodeResult;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case "${childSpec.tagName ?? name}":
						${
							childSpec.type === "array"
								? `(nodeResult.${name} ??= []).push(${emitParserCall(childSpec.item, childSpec.tagName ?? name, globals)})`
								: `nodeResult.${name} = ${emitParserCall(childSpec, childSpec.tagName ?? name, globals)}`
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
`.trim() + "\n";
}

const rootSpec = {
	type: "root",
	children: {
		ListPartsResult: {
			type: "object",
			tagName: "ListPartsResult",
			children: {
				Bucket: { type: "string", tagName: "Bucket" },
				Key: { type: "string" },
				UploadId: { type: "string" },
				StorageClass: { type: "string" },
				PartNumberMarker: { type: "integer" },
				NextPartNumberMarker: { type: "integer" },
				MaxParts: { type: "integer" },
				IsTruncated: { type: "boolean" },
				Initiator: {
					type: "object",
					children: {
						DisplayName: { type: "string" },
						ID: { type: "string" },
					},
				},
				Owner: {
					type: "object",
					children: {
						DisplayName: { type: "string" },
						ID: { type: "string" },
					},
				},
				Part: {
					type: "array",
					item: {
						type: "object",
						children: {
							ETag: { type: "string" },
							LastModified: { type: "date" },
							PartNumber: { type: "integer" },
							Size: { type: "integer" },
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
