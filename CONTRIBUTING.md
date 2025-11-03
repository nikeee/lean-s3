## Checklist for new Features
Want to propose a new feature? Great! We've taken some [design decisions](./DESIGN_DECISIONS.md) that constrain what we want to or be able to do.
Please make sure that your feature aligns with these requirements, so we can align with our design goals:

- Will >80% of the users of this library need it at some point or should they use it?
- Is it supported on **most** S3 providers?
  - Common compat tables: [Hetzner](https://docs.hetzner.com/storage/object-storage/supported-actions), [Cloudflare R2](https://developers.cloudflare.com/r2/api/s3/api/), [Garage](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)

## Prerequisites
You need Docker, npm and Node.js.

- Run tests: `npm test`
- Format: `npm run format`
- Lint: `npm run lint`

This project uses [lefthook](https://github.com/evilmartians/lefthook), thus format should be executed on pre-commit.
