import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing palette popover & note colors...');

const vjPath = path.resolve('components/journal/VolunteerJournal.tsx');
const vjContent = fs.readFileSync(vjPath, 'utf8');

const match = vjContent.match(/export const NOTE_COLORS:[^=]+=\s*(\[[^\]]+\]);/);
assert.ok(match, 'NOTE_COLORS array must be found in VolunteerJournal.tsx');
const NOTE_COLORS = eval(match[1]) as { id: string; label: string; lightBg: string; darkBg: string }[];

// 1. Verify 10 colors
assert.equal(NOTE_COLORS.length, 10, 'NOTE_COLORS must have exactly 10 colors');
console.log('✓ Exactly 10 colors in NOTE_COLORS');

// 2. Verify yellow exists
const yellow = NOTE_COLORS.find(c => c.id === 'yellow');
assert.ok(yellow, 'Yellow color must exist in NOTE_COLORS');
assert.equal(yellow.label, 'Amarillo');
assert.equal(yellow.lightBg, '#fef9c3');
assert.equal(yellow.darkBg, '#383012');
console.log('✓ Yellow color correctly configured');

// 3. Verify color order (5 in row 1, 5 in row 2)
const expectedIds = ['default', 'coral', 'amber', 'yellow', 'emerald', 'teal', 'sky', 'lavender', 'rose', 'slate'];
assert.deepEqual(NOTE_COLORS.map(c => c.id), expectedIds, 'Colors should follow the balanced 5x2 sequence');
console.log('✓ Balanced 5x2 sequence verified');

// 4. Verify CSS classes in journal.module.css
const cssPath = path.resolve('components/journal/journal.module.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

assert.ok(cssContent.includes('.theme_yellow'), 'CSS must define .theme_yellow');
assert.ok(cssContent.includes(':global(.dark) .theme_yellow'), 'CSS must define dark mode .theme_yellow');
assert.ok(cssContent.includes('@keyframes popoverFloatIn'), 'CSS must define @keyframes popoverFloatIn');
assert.ok(cssContent.includes('transform-origin: bottom left'), 'CSS must have transform-origin: bottom left for popovers');
assert.ok(cssContent.includes('cubic-bezier(0.16, 1, 0.3, 1)'), 'CSS must use strong fluid cubic-bezier curve');
assert.ok(
  cssContent.includes('grid-template-columns: repeat(5, 1fr)') ||
  cssContent.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'),
  'CSS grid must be 5 columns'
);

for (const c of NOTE_COLORS) {
  assert.ok(cssContent.includes(`.theme_${c.id}`), `CSS must define .theme_${c.id}`);
  if (c.id !== 'default') {
    assert.ok(cssContent.includes(`:global(.dark) .theme_${c.id}`), `CSS must define dark mode for .theme_${c.id}`);
  }
}
console.log('✓ All 10 theme styles and popover keyframes verified in CSS');

console.log('All palette popover tests passed successfully!');
