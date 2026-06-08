# Clean-room Docker Validation

Clean-room Docker validation verifies that Runlane Core can be rebuilt and started without relying on copied host `node_modules`, previous Prisma Client output, stale Compose state or developer machine residue.

This validation is intentionally separate from `pnpm verify` because it uses Docker builds and can consume more time and bandwidth than the fast local checks.

## When to run

Run this validation when any of these areas change:

- Dockerfile
- `docker-compose.yml`
- `docker-compose.deploy.yml`
- `docker/Caddyfile`
- Prisma migrations
- Runtime start commands
- Deployment environment examples
- GitHub Actions image publishing or smoke workflow

## Command

```powershell
pnpm validate:clean-room
```

The script is compatible with Windows PowerShell 5.1 and uses a dedicated Compose project name so it does not collide with regular local development resources.

## What it validates

The clean-room validation performs these steps:

1. Verifies Docker is available.
2. Runs `pnpm verify` before Docker work starts.
3. Removes any previous clean-room Compose namespace.
4. Builds the local Docker stack without using host `node_modules`.
5. Starts PostgreSQL, Redis and the migrator.
6. Starts API and Worker in detached mode.
7. Waits for API readiness.
8. Waits for Worker readiness.
9. Prints service status and recent logs on failure.
10. Cleans up containers, networks and volumes for the clean-room namespace.

## Expected result

Successful output ends with:

```text
Clean-room Docker validation completed
```

## Failure handling

If validation fails, inspect the printed Compose status and logs. Common causes are missing Docker Engine, unavailable ports, invalid environment values, failed migrations, readiness timeout or a runtime crash.

The script removes its dedicated Compose namespace after completion. It does not delete the default local development namespace unless that namespace was explicitly configured before running the script.
