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
| `PutObject` (20 B)    |           ~220   |          ~415   |        **~340** |
| put+get (20 B)        |           ~110   |          ~345   |        **~340** |
| put+get (20 KiB)      |           ~105   |          ~295   |        **~290** |
| `GetObject` (20 KiB)  |           ~460   |         ~2540   |       **~2430** |
| `HeadObject` / stat   |          ~1160   |         ~1060   |       **~3800** |
| put+get, 32 in flight |          ~1410   |         ~1140   |       **~1250** |

> [!IMPORTANT]
> **undici `8.10.0` caveat:** the sequential (single-in-flight) Node.js + undici numbers above are dominated by undici 8.10.0's idle-socket validation. As part of the mitigation for [GHSA-35p6-xmwp-9g52](https://github.com/nodejs/undici/security/advisories/GHSA-35p6-xmwp-9g52), undici defers each request that reuses an idle keep-alive socket behind a `setTimeout(0)` tick (~1 ms+ per request). 8.7–8.9 ran this validation off `setImmediate` (cheap), but [8.10.0 reverted to `setTimeout(0)`](https://github.com/nodejs/undici/pull/5606) to fix an event-loop stall; see [nodejs/undici#5493](https://github.com/nodejs/undici/issues/5493). With undici pinned to 8.8/8.9, the undici column measures ~450 put / ~2600 get — at parity with `fetch`. Concurrent throughput (the 32-in-flight row) is barely affected, since the tick is paid per idle-socket reuse, not per in-flight request. lean-s3 tracks `^8.10.0` (correctness first); if your workload is a sequential low-RTT loop, benchmark both backends (`LEAN_S3_FORCE_FETCH=1`) and watch the undici issue above.

Takeaways:

- **Bun (fetch) is at parity with or faster than Node.js (undici)** across the board, and substantially faster on `HeadObject`.
- On Node.js with undici ≤ 8.9, the direct undici path beats `fetch` (most visibly on writes), which is why undici remains the Node.js default. On undici 8.10.0, sequential loops pay the idle-socket validation tick described above (Node's built-in `fetch` bundles its own undici copy without that change, which is why the `fetch` column doesn't show it).

Environment for the numbers above: Apple Silicon (macOS, arm64), Node.js v22, Bun v1.3.14, undici 8.10.0, MinIO via Docker on `localhost`. Reproduce by pointing a local MinIO at `http://localhost:9100` (see the `docker-compose.yml` in the repo root) and running the loop under each runtime. Absolute numbers are much lower than the previous revision of this table because of the undici caveat above plus a slower disk/VM configuration for the MinIO container; compare columns within a row, not against older revisions.

## lean-s3 vs Bun's native `Bun.S3Client` (both on Bun)

Since lean-s3 now runs on Bun, here's how it compares to Bun's built-in `Bun.S3Client` for the same operations, both running under Bun against the same local MinIO. Note that `Bun.S3Client` is implemented natively (in Zig, with its own HTTP stack), whereas lean-s3 is plain JavaScript on top of `fetch`.

> [!NOTE]
> Same caveat as above: local machine, local MinIO, network-bound and noisy. Rough relative figures only.

Throughput in operations/second (higher is better). `ratio` is lean-s3 ÷ Bun.S3Client, so `> 1.00x` means lean-s3 was faster; values are taken from the middle of several runs.

| Operation                | lean-s3   | `Bun.S3Client` | ratio (lean ÷ Bun) |
| ------------------------ | --------: | -------------: | -----------------: |
| `PutObject` (20 B)       | ~340      |          ~405  |             ~0.85x |
| put+get (20 B)           | ~340      |          ~345  |             ~0.98x |
| put+get (20 KiB)         | ~290      |          ~350  |             ~0.83x |
| put+get (1 MiB)          | ~75       |           ~95  |             ~0.79x |
| `GetObject` text (20 KiB)| ~2430     |         ~3160  |             ~0.77x |
| `HeadObject` / stat      | ~3800     |         ~4120  |             ~0.92x |
| put+get (20 B) conc=32   | ~1250     |         ~1170  |             ~1.07x |

Takeaways:

- lean-s3 on Bun is **competitive with the native client** &mdash; typically within ~10–20%, and at parity (or slightly ahead) on some operations.
- `Bun.S3Client` keeps a modest edge on most operations (expected for a native implementation).
- The tradeoff: lean-s3 offers a broader, portable API (e.g. `CopyObject`, richer presign/presign-POST options, bucket CORS, fine-grained multipart, `DeleteObjects`) and runs unchanged on both Node.js and Bun, whereas `Bun.S3Client` is Bun-only and more limited in surface area.

Environment: Apple Silicon (macOS, arm64), Bun v1.3.14, MinIO via Docker on `localhost`.

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
