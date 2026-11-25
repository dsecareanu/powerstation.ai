import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublishAllowed, readR2Config, uploadFiles } from "../src/r2";

test("readR2Config names every missing variable", () => {
  assert.throws(
    () => readR2Config({ R2_BUCKET: "b" }),
    /R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/,
  );
});

test("uploadFiles signs a PUT per file, in order, with the right headers", async () => {
  const seen: Request[] = [];
  await uploadFiles(
    [
      { key: "v1/a.json", body: "{}" },
      { key: "v1/meta/status.json", body: "{}" },
    ],
    { accountId: "acct", accessKeyId: "AK", secretAccessKey: "SK", bucket: "bkt" },
    async (r) => {
      seen.push(r);
      return new Response("", { status: 200 });
    },
  );
  assert.deepEqual(
    seen.map((r) => r.url),
    [
      "https://acct.r2.cloudflarestorage.com/bkt/v1/a.json",
      "https://acct.r2.cloudflarestorage.com/bkt/v1/meta/status.json",
    ],
  );
  const r = seen[0]!;
  assert.equal(r.method, "PUT");
  assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(r.headers.get("cache-control"), "public, max-age=300");
  assert.match(
    r.headers.get("authorization")!,
    /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\//,
  );
});

test("uploadFiles stops at the first failure", async () => {
  let calls = 0;
  await assert.rejects(
    uploadFiles(
      [
        { key: "v1/a.json", body: "{}" },
        { key: "v1/b.json", body: "{}" },
      ],
      { accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b" },
      async () => (++calls, new Response("denied", { status: 403 })),
    ),
    /HTTP 403/,
  );
  assert.equal(calls, 1);
});

test("restricted data cannot be published without the explicit permission variable", () => {
  assert.throws(() => assertPublishAllowed(true, {}), /written permission/);
  assert.throws(
    () => assertPublishAllowed(true, { ENTSOE_RESTRICTED_PUBLISH_OK: "no" }),
    /written permission/,
  );
  assert.doesNotThrow(() => assertPublishAllowed(true, { ENTSOE_RESTRICTED_PUBLISH_OK: "yes" }));
  assert.doesNotThrow(() => assertPublishAllowed(false, {}));
});
