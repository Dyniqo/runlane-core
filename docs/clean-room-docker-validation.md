# Clean-room Docker Validation

Clean-room Docker validation checks the image deployment path from a fresh Compose namespace.

This validation is separate from `pnpm verify` because it uses Docker builds and can consume more time and bandwidth than the fast local checks.

## Command

```powershell
pnpm validate:clean-room
```

## What it checks

- Docker Compose configuration renders cleanly.
- Deployment images build from the repository Dockerfile.
- PostgreSQL and Redis start in an isolated Compose namespace.
- The migrator service applies Prisma migrations.
- API and Worker services start with generated Prisma Client output inside the image.
- Caddy validates its configuration and proxies health requests to the API service.
- The validation command removes containers, networks and volumes after completion.

## When to run it

Run this validation after changes to:

- `Dockerfile`
- `docker-compose.deploy.yml`
- `docker/Caddyfile`
- `.env.deploy.example`
- Prisma migration behavior
- API, Worker or migrator image entrypoints

## Notes

The command uses its own Compose project name and generated secrets. It does not use checked-in local environment files.

## Completion output

Successful runs end with:

```txt
Clean-room Docker validation completed
```
