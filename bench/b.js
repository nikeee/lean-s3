import * as rt from "../dist/index.mjs";
export class GeneratedParser extends rt.Parser {
	fn_2_Initiator() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			displayName: undefined,
			id: undefined,
		};

		this.expectIdentifier(16 /* KnownTagIdentifier.Initiator */);

		if (this.token === 4 /* TokenKind.endSelfClosing */) {
			this.nextToken();
			if (res.displayName === undefined)
				throw new TypeError(
					`Value for field "displayName" was required but not present (expected as tag name "DisplayName").`,
				);
			if (res.id === undefined)
				throw new TypeError(
					`Value for field "id" was required but not present (expected as tag name "ID").`,
				);
			return res;
		}

		this.parseExpected(2 /* TokenKind.endTag */);

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.startClosingTag */:
					this.nextToken(); // consume TokenKind.startClosingTag

					this.expectIdentifier(16 /* KnownTagIdentifier.Initiator */);
					this.parseExpected(2 /* TokenKind.endTag */);
					if (res.displayName === undefined)
						throw new TypeError(
							`Value for field "displayName" was required but not present (expected as tag name "DisplayName").`,
						);
					if (res.id === undefined)
						throw new TypeError(
							`Value for field "id" was required but not present (expected as tag name "ID").`,
						);
					return res;
				case 0:
					throw new Error(`Unterminated tag: "Initiator"`);

				case 1: {
					this.nextToken(); // consume TokenKind.startTag

					switch (this.scanner.getIdentifierId()) {
						case 11: // "DisplayName":
							res.displayName = this.parseStringTag(11);
							break;
						case 12: //"ID":
							res.id = this.parseStringTag(12);
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}
	fn_3_Owner() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			displayName: undefined,
			id: undefined,
		};

		this.expectIdentifier(13 /* KnownTagIdentifier.Owner */);

		if (this.token === 4 /* TokenKind.endSelfClosing */) {
			this.nextToken();
			if (res.displayName === undefined)
				throw new TypeError(
					`Value for field "displayName" was required but not present (expected as tag name "DisplayName").`,
				);
			if (res.id === undefined)
				throw new TypeError(
					`Value for field "id" was required but not present (expected as tag name "ID").`,
				);
			return res;
		}

		this.parseExpected(2 /* TokenKind.endTag */);

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.startClosingTag */:
					this.nextToken(); // consume TokenKind.startClosingTag

					this.expectIdentifier(13 /* KnownTagIdentifier.Owner */);
					this.parseExpected(2 /* TokenKind.endTag */);
					if (res.displayName === undefined)
						throw new TypeError(
							`Value for field "displayName" was required but not present (expected as tag name "DisplayName").`,
						);
					if (res.id === undefined)
						throw new TypeError(
							`Value for field "id" was required but not present (expected as tag name "ID").`,
						);
					return res;
				case 0:
					throw new Error(`Unterminated tag: "Owner"`);

				case 1: {
					this.nextToken(); // consume TokenKind.startTag

					switch (this.scanner.getIdentifierId()) {
						case 11: // "DisplayName":
							res.displayName = this.parseStringTag(11);
							break;
						case 12: // "ID":
							res.id = this.parseStringTag(12);
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}
	fn_4_Part() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			etag: undefined,
			lastModified: undefined,
			partNumber: undefined,
			size: undefined,
		};

		this.expectIdentifier(7 /* KnownTagIdentifier.Part */);

		if (this.token === 4 /* TokenKind.endSelfClosing */) {
			this.nextToken();
			if (res.etag === undefined)
				throw new TypeError(
					`Value for field "etag" was required but not present (expected as tag name "ETag").`,
				);
			if (res.lastModified === undefined)
				throw new TypeError(
					`Value for field "lastModified" was required but not present (expected as tag name "LastModified").`,
				);
			if (res.partNumber === undefined)
				throw new TypeError(
					`Value for field "partNumber" was required but not present (expected as tag name "PartNumber").`,
				);
			if (res.size === undefined)
				throw new TypeError(
					`Value for field "size" was required but not present (expected as tag name "Size").`,
				);
			return res;
		}

		this.parseExpected(2 /* TokenKind.endTag */);

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.startClosingTag */:
					this.nextToken(); // consume TokenKind.startClosingTag

					this.expectIdentifier(7 /* KnownTagIdentifier.Part */);
					this.parseExpected(2 /* TokenKind.endTag */);
					if (res.etag === undefined)
						throw new TypeError(
							`Value for field "etag" was required but not present (expected as tag name "ETag").`,
						);
					if (res.lastModified === undefined)
						throw new TypeError(
							`Value for field "lastModified" was required but not present (expected as tag name "LastModified").`,
						);
					if (res.partNumber === undefined)
						throw new TypeError(
							`Value for field "partNumber" was required but not present (expected as tag name "PartNumber").`,
						);
					if (res.size === undefined)
						throw new TypeError(
							`Value for field "size" was required but not present (expected as tag name "Size").`,
						);
					return res;
				case 0:
					throw new Error(`Unterminated tag: "Part"`);

				case 1: {
					this.nextToken(); // consume TokenKind.startTag

					switch (this.scanner.getIdentifierId()) {
						case 8: //"ETag":
							res.etag = this.parseStringTag(8);
							break;
						case 9: //"LastModified":
							res.lastModified = this.parseDateTag(9);
							break;
						case 10: //"PartNumber":
							res.partNumber = this.parseIntegerTag(10);
							break;
						case 15: //"Size":
							res.size = this.parseIntegerTag(15);
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}

	fn_1_ListPartsResult() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			bucket: undefined,
			key: undefined,
			uploadId: undefined,
			storageClass: undefined,
			checksumAlgorithm: undefined,
			checksumType: undefined,
			partNumberMarker: undefined,
			nextPartNumberMarker: undefined,
			maxParts: undefined,
			isTruncated: false,
			initiator: undefined,
			owner: undefined,
			parts: [],
		};

		this.expectIdentifier(0 /* KnownTagIdentifier.ListPartsResult */);

		if (this.token === 4 /* TokenKind.endSelfClosing */) {
			this.nextToken();
			if (res.bucket === undefined)
				throw new TypeError(
					`Value for field "bucket" was required but not present (expected as tag name "Bucket").`,
				);
			if (res.key === undefined)
				throw new TypeError(
					`Value for field "key" was required but not present (expected as tag name "Key").`,
				);
			if (res.uploadId === undefined)
				throw new TypeError(
					`Value for field "uploadId" was required but not present (expected as tag name "UploadId").`,
				);
			if (res.storageClass === undefined)
				throw new TypeError(
					`Value for field "storageClass" was required but not present (expected as tag name "StorageClass").`,
				);
			if (res.maxParts === undefined)
				throw new TypeError(
					`Value for field "maxParts" was required but not present (expected as tag name "MaxParts").`,
				);
			if (res.isTruncated === undefined)
				throw new TypeError(
					`Value for field "isTruncated" was required but not present (expected as tag name "IsTruncated").`,
				);
			return res;
		}

		this.parseExpected(2 /* TokenKind.endTag */);

		while (true) {
			switch (this.token) {
				case 3 /* TokenKind.startClosingTag */:
					this.nextToken(); // consume TokenKind.startClosingTag

					this.expectIdentifier(
						0 /* KnownTagIdentifier.ListPartsResult */,
					);
					this.parseExpected(2 /* TokenKind.endTag */);
					if (res.bucket === undefined)
						throw new TypeError(
							`Value for field "bucket" was required but not present (expected as tag name "Bucket").`,
						);
					if (res.key === undefined)
						throw new TypeError(
							`Value for field "key" was required but not present (expected as tag name "Key").`,
						);
					if (res.uploadId === undefined)
						throw new TypeError(
							`Value for field "uploadId" was required but not present (expected as tag name "UploadId").`,
						);
					if (res.storageClass === undefined)
						throw new TypeError(
							`Value for field "storageClass" was required but not present (expected as tag name "StorageClass").`,
						);
					if (res.maxParts === undefined)
						throw new TypeError(
							`Value for field "maxParts" was required but not present (expected as tag name "MaxParts").`,
						);
					if (res.isTruncated === undefined)
						throw new TypeError(
							`Value for field "isTruncated" was required but not present (expected as tag name "IsTruncated").`,
						);
					return res;
				case 0:
					throw new Error(`Unterminated tag: "ListPartsResult"`);

				case 1: {
					this.nextToken(); // consume TokenKind.startTag

			// 	console.log("this.scanner.getIdentifierId()", this.scanner.getIdentifierId());

					switch (this.scanner.getIdentifierId()) {
						case 22: // "Bucket":
							res.bucket = this.parseStringTag(22);
							break;
						case 1: // "Key":
							res.key = this.parseStringTag(1);
							break;
						case 2: // "UploadId":
							res.uploadId = this.parseStringTag(2);
							break;
						case 14: // "StorageClass":
							res.storageClass = this.parseStringTag(14);
							break;
						case 23: // "ChecksumAlgorithm":
							res.checksumAlgorithm = this.parseStringTag(23) || undefined;
							break;
						case 24: // "ChecksumType":
							res.checksumType = this.parseStringTag(24) || undefined;
							break;
						case 3: // "PartNumberMarker":
							res.partNumberMarker = this.parseIntegerTag(3);
							break;
						case 4: // "NextPartNumberMarker":
							res.nextPartNumberMarker = this.parseIntegerTag(4);
							break;
						case 5: // "MaxParts":
							res.maxParts = this.parseIntegerTag(5);
							break;
						case 6: //"IsTruncated":
							res.isTruncated = this.parseBooleanTag(6);
							break;
						case 16: // "Initiator":
							res.initiator = this.fn_2_Initiator();
							break;
						case 13: // "Owner":
							res.owner = this.fn_3_Owner();
							break;
						case 7: // "Part":
							res.parts.push(this.fn_4_Part());
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}

	parse_0() {
		// Init structure entirely, so v8 can create a single hidden class
		const res = {
			result: undefined,
		};

		while (true) {
			switch (this.token) {
				case 0 /* TokenKind.eof */:
					if (res.result === undefined)
						throw new TypeError(
							`Value for field "result" was required but not present (expected as tag name "ListPartsResult").`,
						);
					return res;

				case 1 /* TokenKind.startTag */: {
					this.nextToken(); // consume TokenKind.startTag

					switch (this.scanner.getTokenValueEncoded()) {
						case "ListPartsResult":
							res.result = this.fn_1_ListPartsResult();
							break;
						default:
							throw new Error(
								`Unexpected tag identifier: ${this.scanner.getTokenValueEncoded()}`,
							);
					}
					break;
				}

				default:
					throw new Error(`Unhandled token kind: ${this.token}`);
			}
		}
	}
}

const s = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Bucket>test-bucket</Bucket>
<Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key>
<UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId>
<PartNumberMarker>0</PartNumberMarker>
<NextPartNumberMarker>3</NextPartNumberMarker>
<MaxParts>1000</MaxParts>
<IsTruncated>false</IsTruncated>
${new Array(10)
	.fill(0)
	.map(
		(_, i) => `
<Part>
<ETag>"${crypto.randomUUID()}"</ETag>
<LastModified>2025-06-20T13:58:01.000Z</LastModified>
<PartNumber>${i + 3}</PartNumber><Size>6291456</Size>
</Part>
`,
	)
	.join("")}
<Part>
<ETag>
"4715e35cf900ae14837e3c098e87d522"</ETag>
<LastModified>2025-06-20T13:58:01.000Z</LastModified>
<PartNumber>1</PartNumber><Size>6291456</Size>
</Part>
<Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag>
<LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag>
<LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator>
<DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`;
const sb = new TextEncoder().encode(s);

const memory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
new Uint8Array(memory.buffer, 0, sb.length).set(sb);

const memRef = {
	memory,
	byteLength: sb.length,
};

const scanner = await rt.Scanner.create(memRef);

let parsed = undefined;
for (let i = 0; i < 100; ++i) {
	scanner.reset();
	parsed = new GeneratedParser(scanner).parse_0();
}

console.log(parsed)
