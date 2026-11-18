import assert from "node:assert/strict";

/**
 * Mirrors the web login single-flight guard (loadingRef).
 * Ensures a second Enter/click while in-flight is ignored.
 */
function createSubmitGuard() {
  let loading = false;
  let submissions = 0;
  return {
    async submit(work: () => Promise<void>) {
      if (loading) return;
      loading = true;
      submissions += 1;
      try {
        await work();
      } finally {
        loading = false;
      }
    },
    get submissions() {
      return submissions;
    },
    get loading() {
      return loading;
    },
  };
}

async function main() {
  const guard = createSubmitGuard();
  let resolveFirst!: () => void;
  const first = new Promise<void>((r) => {
    resolveFirst = r;
  });

  const p1 = guard.submit(() => first);
  const p2 = guard.submit(async () => {
    throw new Error("should not run");
  });

  assert.equal(guard.submissions, 1);
  assert.equal(guard.loading, true);
  resolveFirst();
  await Promise.all([p1, p2]);
  assert.equal(guard.submissions, 1);
  assert.equal(guard.loading, false);

  await guard.submit(async () => undefined);
  assert.equal(guard.submissions, 2);

  console.log("web login-submit-guard tests OK");
}

void main();
