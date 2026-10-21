const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const statements = [];
Pool.prototype.query = async function (sql, params) {
  statements.push({ sql, params });
  return { rows: [] };
};
process.env.DATABASE_URL = 'postgresql://example.invalid/metalab_test';
const handler = require('../api/students');

async function call(method, body, contentType = 'application/json') {
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ method, body, headers: { 'content-type': contentType } }, response);
  return response;
}

test('accepts a valid student and parameterizes the database insert', async () => {
  const response = await call('POST', { name: 'Ana  Silva', email: ' ANA@EXAMPLE.COM ', birthDate: '2005-06-15' });
  assert.equal(response.statusCode, 201);
  assert.match(response.body.id, /^[0-9a-f-]{36}$/);
  assert.equal(response.body.firstName, 'Ana');
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /CREATE TABLE IF NOT EXISTS metalab_students/);
  assert.match(statements[1].sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
  assert.deepEqual(statements[1].params.slice(1), ['Ana Silva', 'ana@example.com', '2005-06-15']);
  assert.equal(JSON.stringify(response.body).includes('example.com'), false);
});

test('rejects invalid dates and unsupported methods before writing', async () => {
  const count = statements.length;
  assert.equal((await call('POST', { name: 'Ana Silva', email: 'ana@example.com', birthDate: '2025-02-30' })).statusCode, 400);
  assert.equal((await call('POST', { name: 'Ana Silva', email: 'invalid', birthDate: '2005-06-15' })).statusCode, 400);
  assert.equal((await call('GET', {})).statusCode, 405);
  assert.equal(statements.length, count);
});
