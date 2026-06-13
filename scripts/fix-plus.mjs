import { readFileSync, writeFileSync } from 'fs';

const files = [
  'js/agent-app.js', 'js/user-app.js', 'js/admin-app.js', 'js/broker-app.js',
  'js/constants.js', 'js/voice.js'
];

const ICON = '<i class="ph ph-plus-circle"></i>';

function isInsideString(line, col) {
  let inStr = null, esc = false;
  for (let i = 0; i < col; i++) {
    const c = line[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) {
      if (c === inStr) inStr = null;
    } else if (c === "'" || c === '"' || c === '`') {
      inStr = c;
    }
  }
  return inStr !== null;
}

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let modified = false;

  // Phase 1: ++ (two consecutive icons)
  const doubleIcon = ICON + ICON;
  let idx;
  while ((idx = content.indexOf(doubleIcon)) !== -1) {
    const lineStart = content.lastIndexOf('\n', idx) + 1;
    const lineEnd = content.indexOf('\n', idx);
    const line = content.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined);
    const col = idx - lineStart;
    if (!isInsideString(line, col)) {
      content = content.slice(0, idx) + '++' + content.slice(idx + doubleIcon.length);
      modified = true;
    } else {
      // Skip past this occurrence
      content = content.slice(0, idx + 1) + '\x00' + content.slice(idx + 1);
    }
  }
  // Restore skipped markers
  content = content.replace(/\x00/g, ICON[0]);

  // Phase 2: += (icon followed by =)
  const iconEq = ICON + '=';
  while ((idx = content.indexOf(iconEq)) !== -1) {
    const lineStart = content.lastIndexOf('\n', idx) + 1;
    const lineEnd = content.indexOf('\n', idx);
    const line = content.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined);
    const col = idx - lineStart;
    if (!isInsideString(line, col)) {
      content = content.slice(0, idx) + '+=' + content.slice(idx + iconEq.length);
      modified = true;
    } else {
      content = content.slice(0, idx + 1) + '\x00' + content.slice(idx + 1);
    }
  }
  content = content.replace(/\x00/g, ICON[0]);

  // Phase 3: single + icon
  while ((idx = content.indexOf(ICON)) !== -1) {
    const lineStart = content.lastIndexOf('\n', idx) + 1;
    const lineEnd = content.indexOf('\n', idx);
    const line = content.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined);
    const col = idx - lineStart;
    if (!isInsideString(line, col)) {
      content = content.slice(0, idx) + '+' + content.slice(idx + ICON.length);
      modified = true;
    } else {
      content = content.slice(0, idx + 1) + '\x00' + content.slice(idx + 1);
    }
  }
  content = content.replace(/\x00/g, ICON[0]);

  if (modified) {
    writeFileSync(file, content, 'utf8');
    console.log(`✅ Fixed: ${file}`);
  } else {
    console.log(`⏭️  No changes: ${file}`);
  }
}
