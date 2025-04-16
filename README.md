# lean-s3 [![npm badge](https://img.shields.io/npm/v/lean-s3)](https://www.npmjs.com/package/lean-s3)

A server-side S3 API for the regular user. lean-s3 tries to provide the 80% of S3 that most people use. It is heavily inspired by [Bun's S3 API](https://bun.sh/docs/api/s3). Requires a Node.js version that supports `fetch`.

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
[@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3) is cumbersome to use and doesn't align well with the current web standards. It is focused on providing a great experienced when used in conjunction with other AWS services. This comes at the cost of performance and package size:

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

Due to its scalability, portability and AWS integrations, pre-signing URLs is `async` and performs poorly in high-performance scenarios. By taking different trade-offs, lean-s3 can presign URLs much faster. I promise! This is the reason you cannot use lean-s3 in the browser.

lean-s3 is currently about 20x faster than AWS SDK when it comes to pre-signing URLs[^1]:
```
benchmark                    avg (min … max) p75 / p99
-------------------------------------------- ---------
@aws-sdk/s3-request-presigner 184.32 µs/iter 183.38 µs
                       (141.15 µs … 1.19 ms) 579.17 µs
                     (312.00  b …   5.07 mb) 233.20 kb

lean-s3                         8.48 µs/iter   8.21 µs
                         (7.85 µs … 1.06 ms)  11.23 µs
                     (128.00  b … 614.83 kb)   5.26 kb

aws4fetch                      65.49 µs/iter  62.83 µs
                        (52.43 µs … 1.01 ms) 158.99 µs
                     ( 24.00  b …   1.42 mb)  53.38 kb

minio client                   19.82 µs/iter  18.35 µs
                        (17.28 µs … 1.61 ms)  34.41 µs
                     (768.00  b … 721.07 kb)  16.18 kb

summary
  lean-s3
   2.34x faster than minio client
   7.72x faster than aws4fetch
   21.74x faster than @aws-sdk/s3-request-presigner
```

Don't trust this benchmark and run it yourself[^2]. I am just some random internet guy trying to tell you [how much better this s3 client is](https://xkcd.com/927/). For `PUT` operations, it is ~1.45x faster than `@aws-sdk/client-s3`. We still work on improving these numbers.

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

[^1]: Benchmark ran on a `13th Gen Intel(R) Core(TM) i7-1370P` using Node.js `23.11.0`. See `bench/` directory for the used benchmark.
[^2]: `git clone git@github.com:nikeee/lean-s3.git && cd lean-s3/bench && npm ci && npm start`
