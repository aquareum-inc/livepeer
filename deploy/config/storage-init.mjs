// Prepares the bundle's own object storage (Garage), then exits. It runs on every `up`, like `migrate`, and
// each step is skipped when it is already done, so setup, upgrade and a plain restart are all safe:
// the one node is given the whole layout, the bucket exists, and the app's key exists and may use the bucket.
// It talks to Garage's admin API only, and prints no secret.
const admin = process.env.GARAGE_ADMIN_URL ?? "http://storage:3903";
const token = process.env.GARAGE_ADMIN_TOKEN ?? "";
const bucket = process.env.STORAGE_BUCKET ?? "";
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.STORAGE_SECRET_KEY ?? "";

function fail(message) {
  console.error(`storage-init: ${message}`);
  process.exit(1);
}
if (!token || !bucket || !accessKeyId || !secretAccessKey) fail("GARAGE_ADMIN_TOKEN, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_KEY must be set. Run ./livepeer setup, which generates them.");

/** One call to the admin API. Answers with the status and the body, parsed when it is JSON. */
async function call(method, path, body) {
  const response = await fetch(`${admin}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}
async function must(method, path, body) {
  const answer = await call(method, path, body);
  if (answer.status < 200 || answer.status > 299) fail(`${method} ${path} answered ${answer.status}: ${answer.body?.message ?? answer.text.slice(0, 200)}`);
  return answer.body;
}

// Garage may still be starting.
let status = null;
for (let attempt = 0; attempt < 60 && !status; attempt += 1) {
  status = await call("GET", "/v2/GetClusterStatus").then((answer) => (answer.status === 200 ? answer.body : answer.status === 401 || answer.status === 403 ? fail("Garage refused GARAGE_ADMIN_TOKEN.") : null), () => null);
  if (!status) await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!status) fail(`Garage's admin API at ${admin} didn't answer within a minute.`);

// 1. The layout: this one node holds everything.
const node = status.nodes?.[0];
if (!node) fail("Garage reported no node.");
if (!node.role) {
  const layout = await must("GET", "/v2/GetClusterLayout");
  // The capacity is how the node's share is weighed against others'. With one node any figure is all of it.
  await must("POST", "/v2/UpdateClusterLayout", { roles: [{ id: node.id, zone: "bundle", capacity: 1_000_000_000, tags: [] }] });
  await must("POST", "/v2/ApplyClusterLayout", { version: layout.version + 1 });
  console.log("storage-init: laid out the node");
}

// 2. The app's key, with the id and secret the instance's .env holds.
const key = await call("GET", `/v2/GetKeyInfo?id=${encodeURIComponent(accessKeyId)}`);
if (key.status !== 200) {
  await must("POST", "/v2/ImportKey", { accessKeyId, secretAccessKey, name: "livepeer-app" });
  console.log("storage-init: added the app's key");
}

// 3. The bucket.
let found = await call("GET", `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(bucket)}`);
if (found.status !== 200) {
  await must("POST", "/v2/CreateBucket", { globalAlias: bucket });
  found = await call("GET", `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(bucket)}`);
  if (found.status !== 200) fail(`the bucket ${bucket} was created but can't be read back.`);
  console.log(`storage-init: created the bucket ${bucket}`);
}

// 4. The key may read and write the bucket's files, and nothing else.
const allowed = found.body.keys?.find((entry) => entry.accessKeyId === accessKeyId)?.permissions;
if (!allowed?.read || !allowed?.write) {
  await must("POST", "/v2/AllowBucketKey", { bucketId: found.body.id, accessKeyId, permissions: { read: true, write: true, owner: false } });
  console.log("storage-init: allowed the app's key to use the bucket");
}
console.log("storage-init: ready");
