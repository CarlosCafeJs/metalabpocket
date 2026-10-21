const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { join } = require('node:path');

test('a file preview never calls the registration API', () => {
  const elements = {
    studentEntry: { hidden: false },
    studentEntryForm: { hidden: false },
    entryMessage: {},
    localPreview: { hidden: true },
    entryCardTitle: { textContent: '' },
    entryCardIntro: { textContent: '' },
    previewWithoutSaving: {},
    privacy: { hidden: false },
    app: { inert: false },
    greeting: { textContent: 'estudante' }
  };
  const classes = new Set();
  const document = {
    body: { classList: { add: name => classes.add(name) } },
    getElementById: id => elements[id],
    querySelector: selector => ({ 'main.wrap': elements.app, '.entry-privacy': elements.privacy, '.greeting strong': elements.greeting })[selector]
  };
  const source = readFileSync(join(__dirname, '../dist/student-entry.js'), 'utf8');
  runInNewContext(source, {
    document,
    location: { protocol: 'file:' },
    fetch: () => { throw new Error('A prévia não deve chamar a API'); }
  });
  assert.equal(elements.studentEntryForm.hidden, true);
  assert.equal(elements.localPreview.hidden, false);
  assert.equal(elements.privacy.hidden, true);
  assert.equal(elements.app.inert, true);
  elements.previewWithoutSaving.onclick();
  assert.equal(elements.studentEntry.hidden, true);
  assert.equal(elements.app.inert, false);
  assert.equal(classes.has('student-ready'), true);
});
