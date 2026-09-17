import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePreferredChapterId } from '../js/adminChapterUtils.js';

test('resolvePreferredChapterId keeps the requested chapter when it is valid', () => {
  const memberships = [
    { chapter_id: 'chapter-a', is_primary: true, role: 'ADMIN' },
    { chapter_id: 'chapter-b', is_primary: true, role: 'ADMIN' }
  ];

  assert.equal(resolvePreferredChapterId('chapter-b', memberships), 'chapter-b');
});

test('resolvePreferredChapterId prefers an explicit primary chapter when multiple memberships exist', () => {
  const memberships = [
    { chapter_id: 'chapter-a', is_primary: false, role: 'ADMIN' },
    { chapter_id: 'chapter-b', is_primary: true, role: 'ADMIN' },
    { chapter_id: 'chapter-c', is_primary: true, role: 'TUTOR' }
  ];

  assert.equal(resolvePreferredChapterId(null, memberships), 'chapter-b');
});

test('resolvePreferredChapterId falls back to the first available chapter when no primary exists', () => {
  const memberships = [
    { chapter_id: 'chapter-a', is_primary: false, role: 'TUTOR' },
    { chapter_id: 'chapter-b', is_primary: false, role: 'ADMIN' }
  ];

  assert.equal(resolvePreferredChapterId(null, memberships), 'chapter-a');
});
