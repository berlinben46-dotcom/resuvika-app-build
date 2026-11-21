import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, normalizeState, wrapNoteTextLines, buildFullNoteVectorElements } from '../src/store.mjs';

test('initial state creates clean default folders, welcome note, and board page', () => {
  const s = createInitialState();
  assert.equal(s.folders.length >= 2, true);
  assert.equal(s.notes.length >= 2, true);
  assert.equal(s.boardPages.length, 1);
  assert.equal(s.settings.themeMode, 'auto');
});

test('normalizeState recovers safely from malformed data', () => {
  const s = normalizeState({ folders: [], notes: 'bad' });
  assert.equal(Array.isArray(s.folders) && s.folders.length > 0, true);
  assert.equal(Array.isArray(s.notes), true);
});

test('buildFullNoteVectorElements preserves the entire note across wrapped vector lines', () => {
  const elems = buildFullNoteVectorElements({
    title: 'Chapter 1: Motion & Laws',
    content: 'First paragraph with enough words to wrap neatly onto multiple crisp lines on mobile screens.\nSecond line stays intact.',
    boardWidth: 360,
    isDark: false
  });
  assert.equal(elems.length >= 3, true);
  assert.equal(elems.every((e) => e.type === 'text' && e.x === 24), true);
  const fullText = elems.map((e) => e.text).join(' ');
  assert.match(fullText, /Second line stays intact/);
});

test('wrapNoteTextLines keeps blank lines for paragraph spacing', () => {
  const lines = wrapNoteTextLines('Line one\n\nLine two', 20);
  assert.deepEqual(lines, ['Line one', '', 'Line two']);
});
