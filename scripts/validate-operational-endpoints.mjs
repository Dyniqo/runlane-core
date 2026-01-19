const apiBaseUrl = normalizeBaseUrl(
  process.env.RUNLANE_VALIDATION_API_URL ?? process.env.API_URL ?? 'http://localhost:4600',
);
const workerBaseUrl = normalizeBaseUrl(
  process.env.RUNLANE_VALIDATION_WORKER_URL ?? 'http://localhost:4601',
);
const apiDocsPath = process.env.API_DOCS_PATH?.trim().replace(/^\/+|\/+$/g, '') || 'docs';

await validateJson(`${apiBaseUrl}/health`, 200, (body) => {
  assertEqual(body.status, 'ok', 'API liveness status');
  assertEqual(body.service, 'api', 'API liveness service');
});
await validateJson(`${apiBaseUrl}/health/ready`, 200, (body) => {
  assertEqual(body.status, 'ready', 'API readiness status');
  assertEqual(body.checks?.database?.status, 'up', 'API database readiness');
  assertEqual(body.checks?.redis?.status, 'up', 'API Redis readiness');
});
await validateJson(`${apiBaseUrl}/health/queue`, 200, (body) => {
  assertEqual(body.status, 'ready', 'API queue status');
  assertEqual(body.queue?.status, 'up', 'API queue transport status');
});
await validateJson(`${apiBaseUrl}/v1`, 200, (body) => {
  assertEqual(body.service, 'api', 'Versioned API descriptor');
});
await validateJson(`${apiBaseUrl}/${apiDocsPath}/openapi.json`, 200, (body) => {
  assert(typeof body.openapi === 'string', 'OpenAPI document version is missing');
  assert(
    typeof body.paths === 'object' && body.paths !== null,
    'OpenAPI document paths are missing',
  );
});
await validateJson(`${workerBaseUrl}/health`, 200, (body) => {
  assertEqual(body.status, 'ok', 'Worker liveness status');
  assertEqual(body.service, 'worker', 'Worker liveness service');
});
await validateJson(`${workerBaseUrl}/health/ready`, 200, (body) => {
  assertEqual(body.status, 'ready', 'Worker readiness status');
});
await validateJson(`${workerBaseUrl}/health/queue`, 200, (body) => {
  assertEqual(body.status, 'ready', 'Worker queue status');
});

process.stdout.write('Operational endpoint validation completed successfully.\n');

async function validateJson(url, expectedStatus, validate) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-correlation-id': 'runtime-validation',
    },
    signal: AbortSignal.timeout(5000),
  });
  const contentType = response.headers.get('content-type') ?? '';

  assertEqual(response.status, expectedStatus, `${url} status code`);
  assert(contentType.includes('application/json'), `${url} did not return JSON`);

  const body = await response.json();
  validate(body);
  process.stdout.write(`Validated ${url}\n`);
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/g, '');
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label} expected ${String(expected)} but received ${String(actual)}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
