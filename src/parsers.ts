import { buildParser } from "./xml-parser/generator.ts";

export const listPartsResultSpec = {
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
					optional: true,
					children: {
						displayName: { type: "string", tagName: "DisplayName" },
						id: { type: "string", tagName: "ID" },
					},
				},
				owner: {
					type: "object",
					tagName: "Owner",
					optional: true,
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
} as const;

export const parseListPartsResult = buildParser(listPartsResultSpec);
