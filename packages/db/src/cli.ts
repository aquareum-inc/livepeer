import { migrate } from "./migrate";

/**
 * `migrate <folder>`: brings the database to this release's schema and prints one line of JSON saying what it
 * did. It runs as the Compose bundle's `migrate` service, as `pnpm db:migrate`, and in a serverless host's
 * build. The address is never printed: it holds the password.
 */
async function main(): Promise<number> {
  const folder = process.argv[2];
  if (!folder) {
    process.stderr.write("usage: migrate <migrations folder>\n");
    return 2;
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("migrate: DATABASE_URL is not set, so there is no database to migrate. Without one the instance keeps its state in files (development and tests only).\n");
    return 1;
  }
  try {
    process.stdout.write(`${JSON.stringify(await migrate({ url, folder }))}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`migrate: failed, and nothing was changed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

void main().then((code) => process.exit(code));
