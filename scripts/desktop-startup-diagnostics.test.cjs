const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDiagnosticText, formatStartupEntry, getPackagedNodePath } = require('../electron/startup-diagnostics.cjs');

test('startup diagnostics reduce runtime output to a safe allowlisted code', () => {
  const sensitive = 'Error for aluno@example.com at C:\\Users\\Alice\\offline.sqlite token=secret123 MODULE_NOT_FOUND';
  assert.equal(classifyDiagnosticText(sensitive), 'missing_module');
  const entry = formatStartupEntry('next-process-exit', classifyDiagnosticText(sensitive));
  assert.match(entry, /stage=next-process-exit code=missing_module/u);
  assert.doesNotMatch(entry, /aluno@example\.com|Alice|secret123|offline\.sqlite/u);
  assert.equal(classifyDiagnosticText("Error: Cannot find module 'next/dist/server/lib/start-server' at C:\\Users\\Alice\\project"), 'missing_next');
  assert.equal(classifyDiagnosticText("Error: Cannot find module 'C:\\Users\\Alice\\private-module.js'"), 'missing_runtime_file');
});

test('unknown startup stage and code cannot inject log content', () => {
  const entry = formatStartupEntry('failed\nsecret', 'http://host/path token=value');
  assert.match(entry, /stage=unknown-stage code=unknown-code/u);
  assert.doesNotMatch(entry, /secret|host|token|path/u);
});

test('packaged Next runtime resolves dependencies from the dependency archive', () => {
  assert.equal(
    getPackagedNodePath(true, 'C:\\MetaLab\\resources'),
    'C:\\MetaLab\\resources\\next-server\\server-dependencies'
  );
  assert.equal(getPackagedNodePath(false, 'C:\\MetaLab\\resources'), undefined);
});
