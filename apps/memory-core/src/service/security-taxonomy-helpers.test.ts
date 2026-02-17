import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSeverityAtLeast,
  resolveSecurityClassification,
  severityScore,
} from './helpers/security-taxonomy-helpers.js';

test('resolveSecurityClassification infers raw.search as security data medium', () => {
  const result = resolveSecurityClassification({
    action: 'raw.search',
    target: {},
  });
  assert.equal(result.isSecurityEvent, true);
  assert.equal(result.category, 'data');
  assert.equal(result.severity, 'medium');
});

test('resolveSecurityClassification honors explicit severity/category in target', () => {
  const result = resolveSecurityClassification({
    action: 'auth.login_failed',
    target: {
      severity: 'low',
      category: 'config',
    },
  });
  assert.equal(result.isSecurityEvent, true);
  assert.equal(result.category, 'config');
  assert.equal(result.severity, 'low');
});

test('severity ordering works as expected', () => {
  assert.equal(isSeverityAtLeast('high', 'medium'), true);
  assert.equal(isSeverityAtLeast('medium', 'medium'), true);
  assert.equal(isSeverityAtLeast('low', 'medium'), false);
  assert.equal(severityScore('high') > severityScore('low'), true);
});
