/**
 * Writes docs/mobile/openapi.json from the instance's operations list. Inputs come from each
 * operation; outputs are JSON Schemas generated from the API client's exported TypeScript types, so the
 * types stay the single definition. Operator operations are left out unless they are marked for phones
 * (`mobile`); those, and the console session's own operations, carry `x-operator: true` and go into the
 * native apps' separate operator client.
 * Run with `pnpm api:openapi`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGenerator } from "ts-json-schema-generator";

import { OPERATIONS, OPERATOR_SESSION_OPERATIONS, type Operation } from "../../../apps/web/lib/public-api/operations.ts";

type Json = Record<string, unknown>;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const operations = OPERATIONS.filter((operation) => !operation.operator || operation.mobile);
/** Whether an operation belongs to the console on a phone rather than the user app. */
const forConsole = (operation: Operation) => operation.operator === true || OPERATOR_SESSION_OPERATIONS.includes(operation.name);

const outputName = (operation: Operation): string => {
  if (!operation.output) throw new Error(`${operation.name} has no output`);
  return Array.isArray(operation.output) ? operation.output[0] : operation.output;
};

// One pass over the API client's types for every name an operation answers with.
const generator = createGenerator({
  path: path.join(root, "packages/api-client/src/index.ts"),
  tsconfig: path.join(root, "packages/api-client/tsconfig.json"),
  expose: "export",
  skipTypeCheck: true,
  additionalProperties: false,
  topRef: true,
});
const schemas: Record<string, Json> = {};
for (const name of [...new Set(operations.map(outputName))].sort()) {
  const schema = generator.createSchema(name);
  for (const [key, value] of Object.entries(schema.definitions ?? {})) schemas[key] = value as Json;
}

/** Points references at OpenAPI's components, and drops the generator's own keys. */
function rewrite(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Json).map(([key, entry]) => [key, key === "$ref" && typeof entry === "string" ? entry.replace("#/definitions/", "#/components/schemas/") : rewrite(entry)]),
  );
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });

const paths: Record<string, Json> = {};
for (const operation of operations) {
  const input = operation.input as { properties?: Record<string, Json>; required?: string[] };
  const properties = input.properties ?? {};
  const required = new Set(input.required ?? []);
  const inPath = [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
  const takesBody = operation.method === "POST" || operation.method === "PUT" || operation.method === "PATCH";
  const rest = Object.keys(properties).filter((name) => !inPath.includes(name));

  const parameters = [
    ...inPath.map((name) => ({ name, in: "path", required: true, schema: { type: "string" }, ...(properties[name]?.description ? { description: properties[name].description } : {}) })),
    ...(takesBody ? [] : rest.map((name) => ({ name, in: "query", required: required.has(name), schema: properties[name] }))),
  ];
  const body = takesBody && rest.length > 0
    ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: Object.fromEntries(rest.map((name) => [name, properties[name]])), required: rest.filter((name) => required.has(name)), additionalProperties: false } } } } }
    : {};
  const output = Array.isArray(operation.output) ? { type: "array", items: ref(outputName(operation)) } : ref(outputName(operation));

  paths[operation.path] = {
    ...paths[operation.path],
    [operation.method.toLowerCase()]: {
      operationId: operation.name,
      summary: operation.description,
      ...(operation.public ? { security: [] } : {}),
      ...(forConsole(operation) ? { "x-operator": true } : {}),
      ...(operation.mobile ? { "x-mobile": operation.mobile } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...body,
      responses: {
        "200": { description: "The result.", content: { "application/json": { schema: output } } },
        ...(operation.public ? {} : { "401": errorResponse("No valid bearer token.") }),
        default: errorResponse("The request was refused or failed."),
      },
    },
  };
}

const document = {
  openapi: "3.1.0",
  info: {
    title: "Livepeer instance API",
    version: "1",
    description: "Everything the user app can do on an instance, and what the operator console can do from a phone (x-operator). Generated from apps/web/lib/public-api/operations.ts; do not edit.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearer: [] }],
  paths,
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "An API key or a device session token; for x-operator operations, an operator device session token. An x-mobile read needs the session unlocked; an x-mobile confirm needs an X-Operator-Proof header. Operations marked with empty security answer without one." } },
    schemas: {
      ...(rewrite(schemas) as Record<string, Json>),
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { status: { type: "number" }, message: { type: "string" }, code: { type: "string", description: "A stable reason a client can act on: signed_out, mobile_off, account_required, sign_in_expired; for the console on a phone: mobile_console_off, web_only, locked, proof_required, operator_session, operator_device_required, rate_limited, alerts_not_offered, alerts_off." } }, required: ["status", "message"], additionalProperties: false } },
        required: ["error"],
        additionalProperties: false,
      },
    },
  },
};

const target = path.join(root, "docs/mobile/openapi.json");
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${operations.length} operations and ${Object.keys(document.components.schemas).length} schemas to docs/mobile/openapi.json.`);
