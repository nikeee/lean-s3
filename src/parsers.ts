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

export const parseListBucketResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "ListBucketResult",
			children: {
				name: { type: "string", tagName: "Name" },
				prefix: { type: "string", tagName: "Prefix" },
				startAfter: { type: "string", tagName: "StartAfter", optional: true },
				isTruncated: {
					type: "boolean",
					tagName: "IsTruncated",
					defaultValue: false,
				},
				continuationToken: {
					type: "string",
					tagName: "ContinuationToken",
					optional: true,
				},
				nextContinuationToken: {
					type: "string",
					tagName: "NextContinuationToken",
					optional: true,
				},
				maxKeys: { type: "integer", tagName: "MaxKeys", defaultValue: 1000 },
				keyCount: { type: "integer", tagName: "KeyCount" },
				contents: {
					type: "array",
					tagName: "Contents",
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							key: { type: "string", tagName: "Key" },
							size: { type: "integer", tagName: "Size" },
							lastModified: { type: "date", tagName: "LastModified" },
							etag: { type: "string", tagName: "ETag" },
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
						},
					},
				},
			},
		},
	},
});

export const parseInitiateMultipartUploadResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "InitiateMultipartUploadResult",
			children: {
				bucket: { type: "string", tagName: "Bucket" },
				key: { type: "string", tagName: "Key" },
				uploadId: { type: "string", tagName: "UploadId" },
			},
		},
	},
});
