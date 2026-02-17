import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../../errors.js';
import { assertGroupMappingRole } from './oidc-types.js';

test('workspace mapping role validation', () => {
  assert.doesNotThrow(() => assertGroupMappingRole('workspace', 'OWNER'));
  assert.throws(() => assertGroupMappingRole('workspace', 'WRITER'), ValidationError);
});

test('project mapping role validation', () => {
  assert.doesNotThrow(() => assertGroupMappingRole('project', 'WRITER'));
  assert.throws(() => assertGroupMappingRole('project', 'ADMIN'), ValidationError);
});
