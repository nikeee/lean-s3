# lean-s3 [![npm badge](https://img.shields.io/npm/v/lean-s3)](https://www.npmjs.com/package/lean-s3)

A server-side S3 API for the regular user. lean-s3 tries to provide the 80% of S3 that most people use. It is heavily inspired by [Bun's S3 API](https://bun.sh/docs/api/s3). Requires a supported Node.js version.

## Elevator Pitch
```js
import { S3Client } from "lean-s3";

const client = new S3Client({
    // All of these are _required_
    // lean-s3 doesn't guess any of these. See below for common values for most providers
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    region: "auto",
    bucket: env.S3_BUCKET, // required here, but you can specify a different bucket later
});

const test = client.file("/test.json");

const exists = await test.exists();

console.log("Does it exist?", exists);

if (exists) {
    console.log("Seems so. How big is it?");

    const stat = await test.stat();
    console.log("Object size in bytes:", stat.size);

    console.log("Its contents:");
    console.log(await test.text()); // If it's JSON: `await test.json()`

    // Delete the object:
    // await test.delete();

    // copy object to a different bucket in a different region
    const otherFile = client.file("/new-file.json", {
        bucket: "foo-bucket",
        region: "bar-region",
    });
    await otherFile.write(test);

    const firstBytesFile = test.slice(0, 100); // lazy-evaluated slicing
    const firstBytes = await firstBytesFile.bytes(); // evaluated using HTTP range requests
    console.log("First 100 bytes:", firstBytes);
}

console.log("Pre-signing URL for clients:");

const url = test.presign({ method: "PUT" }); // synchronous, no await needed
console.log(url);
```

### Installation
```sh
# choose your PM
npm install lean-s3
yarn add lean-s3
pnpm add lean-s3
```

## Why?
[@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3) is cumbersome to use and doesn't align well with the current web standards. It is focused on providing a great experience when used in conjunction with other AWS services. This comes at the cost of performance and package size:

```sh
$ npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
$ du -sh node_modules
21M	node_modules

# vs

$ npm i lean-s3
$ du -sh node_modules
1,8M	node_modules
```
`lean-s3` is _so_ lean that it is ~1.8MB just to do a couple of HTTP requests <img src="https://cdn.frankerfacez.com/emoticon/480839/1" width="20" height="20">
BUT...

Due to the scalability, portability and AWS integrations of @aws-sdk/client-s3, pre-signing URLs is `async` and performs poorly in high-performance scenarios. By taking different trade-offs, lean-s3 can presign URLs much faster. I promise! This is the reason you cannot use lean-s3 in the browser.

lean-s3 is currently about 30x faster than AWS SDK when it comes to pre-signing URLs:
```
benchmark                    avg (min … max) p75 / p99
-------------------------------------------- ---------
@aws-sdk/s3-request-presigner 130.73 µs/iter 128.99 µs
                     (102.27 µs … 938.72 µs) 325.96 µs
                     (712.00  b …   5.85 mb) 228.48 kb

lean-s3                         4.22 µs/iter   4.20 µs
                         (4.02 µs … 5.96 µs)   4.52 µs
                     (  3.54 kb …   3.54 kb)   3.54 kb

aws4fetch                      52.41 µs/iter  50.71 µs
                        (36.06 µs … 1.79 ms) 173.15 µs
                     ( 24.00  b …   1.66 mb)  51.60 kb

minio client                   16.21 µs/iter  15.13 µs
                        (13.14 µs … 1.25 ms)  27.08 µs
                     (192.00  b …   1.43 mb)  16.02 kb

summary
  lean-s3
   3.84x faster than minio client
   12.42x faster than aws4fetch
   30.99x faster than @aws-sdk/s3-request-presigner
```

Don't trust this benchmark and [run it yourself](./BENCHMARKS.md). I am just some random internet guy trying to tell you [how much better this s3 client is](https://xkcd.com/927/). For `PUT` operations, it is ~1.5x faster than `@aws-sdk/client-s3`. We still work on improving these numbers.

See [BENCHMARKS.md](./BENCHMARKS.md) for more numbers and how to run it yourself. PRs for improving the benchmarks are welcome!

## Why not lean-s3?
Don't use lean-s3 if you
- need a broader set of S3 operations.
- need a tight integration into the AWS ecosystem.
- need browser support.
- are already using `@aws-sdk/client-s3` and don't have any issues with it.
- are using Bun. Bun ships with a great built-in S3 API.

## I need feature X
We try to keep this library small. If you happen to need something that is not supported, maybe using the AWS SDK is an option for you. If you think that it is something that >80% of users of this library will need at some point, feel free to open an issue.

See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) to read about why this library is the way it is.

## Supported Operations

### Bucket Operations
- ✅ [`CreateBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html) via `.createBucket`
- ✅ [`DeleteBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteBucket.html) via `.deleteBucket`
- ✅ [`HeadBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html) via `.bucketExists`

### Object Operations
- ✅ [`ListObjectsV2`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) via `.list`/`.listIterating`
- ✅ [`DeleteObjects`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html) via `.deleteObjects`
- ✅ [`DeleteObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html) via `S3File.delete`
- ✅ [`PutObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html) via `S3File.write`
- ✅ [`HeadObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html) via `S3File.exists`/`S3File.stat`
- ✅ [`ListMultipartUploads`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html) via `.listMultipartUploads`
- ✅ [`ListParts`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html) via `.listParts`
- ✅ [`UploadPart`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html) via `.uploadPart`
- ✅ [`CompleteMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html) via `.completeMultipartUpload`
- ✅ [`AbortMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html) via `.abortMultipartUpload`
- ✅ [`PutBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketCors.html) via `.putBucketCors`
- ✅ [`GetBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketCors.html) via `.getBucketCors`
- ✅ [`DeleteBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteBucketCors.html) via `.deleteBucketCors`

## Example Configurations
### Hetzner Object Storage
```js
const client = new S3Client({
    endpoint: "https://fsn1.your-objectstorage.com", // "fsn1" may be different depending on your selected data center
    region: "auto",
    bucket: "<your-bucket-name>",
    accessKeyId: process.env.S3_ACCESS_KEY_ID, // <your-access-key-id>,
    secretAccessKey: process.env.S3_SECRET_KEY, // <your-secret-key>,
});
```

### Cloudflare R2
```js
const client = new S3Client({
    endpoint: "https://<account-id>.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "<your-bucket-name>",
    accessKeyId: process.env.S3_ACCESS_KEY_ID, // <your-access-key-id>,
    secretAccessKey: process.env.S3_SECRET_KEY, // <your-secret-key>,
});
```

### Amazon AWS S3
```js
const client = new S3Client({
    // keep {bucket} and {region} placeholders (they are used internally).
    endpoint: "https://{bucket}.s3.{region}.amazonaws.com",
    region: "<your-region>",
    bucket: "<your-bucket-name>",
    accessKeyId: process.env.S3_ACCESS_KEY_ID, // <your-access-key-id>,
    secretAccessKey: process.env.S3_SECRET_KEY, // <your-secret-key>,
});
```

Popular S3 provider missing? Open an issue or file a PR!

## Tested On
To ensure compability across various providers and self-hosted services, all tests are run on:
- Amazon AWS S3
- Hetzner Object Storage
- Cloudflare R2
- Garage
- Minio
- LocalStack
- Ceph
