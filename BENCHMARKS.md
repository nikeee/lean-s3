# lean-s3 performance benchmarks

Don't trust these tests as they were done on a local machine and a local MinIO instance. Results depend on network conditions, hardware, and magic and _will_ be different on your machine. You can run the benchmarks on your machine:
```sh
git clone git@github.com:nikeee/lean-s3.git
cd lean-s3
npm ci
npm run build
cd bench
npm ci

# benchmarks for presigning URLs
npm run bench:presign
# benchmarks for CRUD operations
npm run bench:crud
```

You can use `npm run bench:presign:bun` to run the presign benchmarks using Bun.

## Node.js (undici) vs Bun (fetch)

lean-s3 uses a runtime-adaptive HTTP backend: [`undici`](https://github.com/nodejs/undici) on Node.js (its fast, low-level path) and the global `fetch` on Bun (which lacks a usable undici `Dispatcher`). See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#runtime-adaptive-http-backend-undici-on-nodejs-fetch-on-bun) for the rationale. This section reports how those two paths compare for the same lean-s3 code.

> [!NOTE]
> Same caveat as above: these were measured on a local machine against a local MinIO. They are network-bound and noisy, so treat them as rough relative figures, not absolutes. They will differ on your machine.

To isolate the client-side HTTP backend cost, this is a simple sequential/concurrent put+get loop against a local MinIO, run with three configurations:

- **Node.js + undici** &mdash; the default on Node.js.
- **Node.js + fetch** &mdash; forced via `LEAN_S3_FORCE_FETCH=1`; shown only to illustrate why undici is the default on Node.js (Node's `fetch` is itself implemented on top of undici, with extra browser-oriented overhead).
- **Bun + fetch** &mdash; the default on Bun (Bun implements `fetch` natively).

Throughput in operations/second (higher is better), median of repeated runs:

| Operation             | Node.js + undici | Node.js + fetch | **Bun + fetch** |
| --------------------- | ---------------: | --------------: | --------------: |
| `PutObject` (20 B)    |           ~660   |          ~550   |        **~720** |
| put+get (20 B)        |           ~520   |          ~495   |        **~570** |
| put+get (20 KiB)      |           ~455   |          ~430   |        **~500** |
| `GetObject` (20 KiB)  |          ~1650   |         ~1510   |       **~1955** |
| `HeadObject` / stat   |          ~1155   |         ~1120   |       **~3900** |
| put+get, 32 in flight |          ~2580   |         ~2200   |       **~2840** |

Takeaways:

- **Bun (fetch) is at parity with or faster than Node.js (undici)** across the board, and substantially faster on `HeadObject`.
- On Node.js, the direct undici path beats `fetch` (most visibly on writes), which is why undici remains the Node.js default.

Environment for the numbers above: Apple M2 (macOS, arm64), Node.js v22, Bun v1.3, MinIO via Docker on `localhost`. Reproduce by pointing a local MinIO at `http://localhost:9100` (see the `docker-compose.yml` in the repo root) and running the loop under each runtime.

## Presign
![image](https://github.com/user-attachments/assets/711c0338-e67f-4c9e-a127-d15e82032050)

## GetObject / PutObject
![Screenshot From 2025-06-15 19-35-09](https://github.com/user-attachments/assets/9b3d90b9-e1da-48bc-a714-1b6cd1ef2c1a)
![Screenshot From 2025-06-15 19-35-48](https://github.com/user-attachments/assets/1be1ef20-ed31-461f-9809-dd216bb2e2c0)
![Screenshot From 2025-06-15 19-38-49](https://github.com/user-attachments/assets/8f48afbe-f4d2-4e3d-bc0f-6762a2630d13)
![Screenshot From 2025-06-15 19-38-27](https://github.com/user-attachments/assets/7e0f7338-a649-4975-bf58-63a252ccff54)
![Screenshot From 2025-06-15 19-36-14](https://github.com/user-attachments/assets/0f14f61f-037c-4311-91f7-5c0b4aa17486)

## ListObjectsV2
![Screenshot From 2025-06-15 19-36-34](https://github.com/user-attachments/assets/ac947efa-dd69-46e6-b55c-ede518a2a1fe)
