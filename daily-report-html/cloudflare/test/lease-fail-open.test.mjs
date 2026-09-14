import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsLeaseFailOpen } from '../src/worker.js';

test('authenticated report reads may survive a concurrency controller outage', () => {
  assert.equal(allowsLeaseFailOpen('/api/data', 'GET'), true);
  assert.equal(allowsLeaseFailOpen('/api/pitstop-history', 'GET'), true);
  assert.equal(allowsLeaseFailOpen('/api/pitstop-performance', 'GET'), true);
  assert.equal(allowsLeaseFailOpen('/api/email-sales', 'GET'), true);
  assert.equal(allowsLeaseFailOpen('/api/b2w', 'GET'), true);
});

test('writes, uploads, auth and concurrency routes remain fail closed', () => {
  assert.equal(allowsLeaseFailOpen('/api/data', 'PUT'), false);
  assert.equal(allowsLeaseFailOpen('/api/b2w', 'PUT'), false);
  assert.equal(allowsLeaseFailOpen('/api/pitstop-history', 'DELETE'), false);
  assert.equal(allowsLeaseFailOpen('/api/pitstop-history/grafana', 'GET'), false);
  assert.equal(allowsLeaseFailOpen('/api/auth/upload-login', 'POST'), false);
  assert.equal(allowsLeaseFailOpen('/api/concurrency/heartbeat', 'POST'), false);
  assert.equal(allowsLeaseFailOpen('/', 'GET'), false);
});
