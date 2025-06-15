# lean-s3 performance benchmarks

Don't trust these tests as they were done on a local machine and a local MinIO instance. You can run them on your machine:
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

You can use `npm run bench:presign:bun` to run the presign benchmarks using Bun. The CRUD benchmarks don't work using Bun due to some bug that prevents the MinIO testcontainer from starting.
