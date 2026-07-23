import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError, requestJSON } from '../../public/js/api_client.mjs';

function response(body, { status = 200, contentType = 'application/json' } = {}) {
  return new Response(body, {
    status,
    headers: contentType ? { 'content-type': contentType } : {},
  });
}

test('requestJSON parses a successful JSON response', async () => {
  const result = await requestJSON('/api/example', {}, async () =>
    response(JSON.stringify({ ok: true, items: [1, 2] })),
  );

  assert.deepEqual(result, { ok: true, items: [1, 2] });
});

test('requestJSON prefers error over message in a JSON HTTP error', async () => {
  await assert.rejects(
    requestJSON('/api/example', {}, async () =>
      response(
        JSON.stringify({
          error: 'Access denied',
          message: 'Generic forbidden response',
          code: 'ACCESS_DENIED',
        }),
        { status: 403 },
      ),
    ),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.name, 'ApiError');
      assert.equal(error.status, 403);
      assert.equal(error.message, 'Access denied');
      assert.equal(error.code, 'ACCESS_DENIED');
      return true;
    },
  );
});

test('requestJSON falls back to message in a JSON HTTP error', async () => {
  await assert.rejects(
    requestJSON('/api/example', {}, async () =>
      response(JSON.stringify({ message: 'Request conflict', code: 'CONFLICT' }), {
        status: 409,
      }),
    ),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.message, 'Request conflict');
      assert.equal(error.code, 'CONFLICT');
      return true;
    },
  );
});

test('requestJSON uses safe fallbacks for a non-JSON HTTP error', async () => {
  await assert.rejects(
    requestJSON('/api/example', {}, async () =>
      response('upstream stack trace', {
        status: 502,
        contentType: 'text/plain',
      }),
    ),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.message, 'Request failed with status 502');
      assert.equal(error.code, 'HTTP_ERROR');
      assert.doesNotMatch(error.message, /stack trace/);
      return true;
    },
  );
});

test('requestJSON wraps network failures without exposing their details', async () => {
  for (const failure of [
    new TypeError('getaddrinfo ENOTFOUND internal.example'),
    new Error('database host and token leaked'),
  ]) {
    await assert.rejects(
      requestJSON('/api/example', {}, async () => {
        throw failure;
      }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 0);
        assert.equal(error.code, 'NETWORK_ERROR');
        assert.equal(error.message, 'Network request failed');
        assert.doesNotMatch(error.message, /ENOTFOUND|database|token/i);
        return true;
      },
    );
  }
});

test('requestJSON preserves AbortError cancellation semantics', async () => {
  const abortError = new DOMException('The operation was aborted.', 'AbortError');

  await assert.rejects(
    requestJSON('/api/example', {}, async () => {
      throw abortError;
    }),
    (error) => error === abortError && error.name === 'AbortError',
  );
});

test('requestJSON returns null for successful empty responses', async () => {
  const noContent = await requestJSON('/api/example', {}, async () =>
    response(null, { status: 204 }),
  );
  const emptyBody = await requestJSON('/api/example', {}, async () => response(''));

  assert.equal(noContent, null);
  assert.equal(emptyBody, null);
});

test('requestJSON reports malformed JSON response bodies', async () => {
  await assert.rejects(
    requestJSON('/api/example', {}, async () => response('{not valid JSON')),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 200);
      assert.equal(error.message, 'Response contained invalid JSON');
      assert.equal(error.code, 'INVALID_JSON');
      return true;
    },
  );
});
