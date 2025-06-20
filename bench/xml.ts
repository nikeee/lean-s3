import { summary, group, bench, run } from "mitata";
import { XMLParser } from "fast-xml-parser";

class Scanner {
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

const tokenKind = {
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
	minus: 0x2d,

	equals: 0x3d, // =
	doubleQuote: 0x22, // "

	A: 0x41,
	Z: 0x5a,
	a: 0x61,
	z: 0x7a,
	_: 0x5f,
};

const text = `<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test-bucket</Bucket><Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key><UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><ETag>"4715e35cf900ae14837e3c098e87d522"</ETag><LastModified>2025-06-20T13:58:01.000Z</LastModified><PartNumber>1</PartNumber><Size>6291456</Size></Part><Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`;

function scanExpected(scanner: Scanner, expected: number) {
	if (scanner.scan() !== expected) {
		throw new Error(`Wrong token, expected: ${expected}`);
	}
}

function skipAttributes(scanner: Scanner) {
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

function expectIdentifier(scanner: Scanner, identifier: string) {
	scanExpected(scanner, tokenKind.identifier);
	if (scanner.tokenValue !== identifier) {
		throw new Error(
			`Expected closing tag for identifier: ${identifier}, got: ${scanner.tokenValue}`,
		);
	}
}
function expectClosingTag(scanner: Scanner, tagName: string) {
	scanExpected(scanner, tokenKind.startClosingTag);
	expectIdentifier(scanner, tagName);
	scanExpected(scanner, tokenKind.endTag);
}
function parseStringTag(scanner: Scanner, tagName: string): string {
	skipAttributes(scanner);
	scanner.scan(); // consume >
	const value = scanner.tokenValue;
	expectClosingTag(scanner, tagName);
	return value;
}
function parseDateTag(scanner: Scanner, tagName: string): Date {
	const value = parseStringTag(scanner, tagName);
	const r = new Date(value);
	if (Number.isNaN(r.getTime())) {
		throw new Error(`Expected valid date time: "${value}"`);
	}
	return r;
}
function parseIntegerTag(scanner: Scanner, tagName: string): number {
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
function parseBooleanTag(scanner: Scanner, tagName: string): boolean {
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

console.log(text);

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

console.log("Parsing");
const p = parseListPartsResult(text);
console.log("End parsing", p);

const x = new XMLParser({
	ignoreAttributes: true,
});
console.log("fxml", x.parse(text).ListPartsResult);

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

await run();
