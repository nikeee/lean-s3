## Checklist for new Features
Want to propose a new feature? Great! We've taken some [design decisions](./DESIGN_DECISIONS.md) that constrain what we want to or be able to do.
Please make sure that your feature aligns with these requirements, so we can align with our design goals:

- Will >80% of the users of this library need it at some point or should they use it?
- Is it supported on **most** S3 providers?
  - Common compat tables: [Hetzner](https://docs.hetzner.com/storage/object-storage/supported-actions), [Cloudflare R2](https://developers.cloudflare.com/r2/api/s3/api/), [Garage](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)

## Prerequisites
You need Docker, plus npm and Node.js (and optionally Bun).

- Run tests (Node.js): `npm test`
- Run tests (Bun): `npm run test:bun` (or `bun run test:bun`)
- Format: `npm run format`
- Lint: `npm run lint`

The integration tests use [testcontainers](https://testcontainers.com/) to spin up real S3 implementations (MinIO, LocalStack, etc.) via Docker. If testcontainers can't find your Docker socket (common with Docker Desktop / OrbStack on macOS), point it at the right socket, e.g.:

```sh
DOCKER_HOST="unix://$HOME/.orbstack/run/docker.sock" npm test
```

For quick manual testing against a local MinIO, a `docker-compose.yml` is included (it exposes MinIO on `http://localhost:9100`, console on `:9101`, and pre-creates a `test-bucket`):

```sh
docker compose up -d
```

### Runtime support
lean-s3 runs on both Node.js and Bun. On Node.js it uses [`undici`](https://github.com/nodejs/undici) for performance; on Bun (which lacks a usable undici `Dispatcher`) it falls back to the global `fetch`. See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) for details. The test suite is runner-agnostic via `src/test-harness.ts`, so the same test files run under both `node --test` and `bun test`.

This project uses [lefthook](https://github.com/evilmartians/lefthook), thus format should be executed on pre-commit.
