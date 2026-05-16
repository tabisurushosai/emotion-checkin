#!/usr/bin/env node
// T035: release/emotion-checkin.zip 生成
// Chrome Web Store にアップロード可能な zip を release/emotion-checkin.zip に出力する。
//
// Zip ルート構成 (manifest.json から参照されるパス前提):
//   manifest.json
//   icons/icon{16,48,128}.png
//   _locales/{ja,en}/messages.json
//   src/popup.html               <- dist/src/popup.html
//   src/options.html             <- dist/src/options.html
//   assets/...                   <- dist/assets/*
//   background.js                <- dist/background.js
//
// 事前条件: `npm run build` 済みで dist/ が最新であること
// (package script は `npm run build && node scripts/package.mjs` の順で連結済み)

import { mkdir, rm, cp, access, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const RELEASE = resolve(ROOT, 'release');
const STAGE = resolve(RELEASE, '_stage');
const OUT_ZIP = resolve(RELEASE, 'emotion-checkin.zip');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursive(resolve(dir, e.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

async function main() {
  if (!(await exists(DIST))) {
    throw new Error(`dist/ not found at ${DIST} — run \`npm run build\` first.`);
  }
  for (const req of ['background.js', 'src/popup.html', 'src/options.html', 'assets']) {
    if (!(await exists(resolve(DIST, req)))) {
      throw new Error(`Required build output missing: dist/${req}`);
    }
  }

  await mkdir(RELEASE, { recursive: true });
  await rm(STAGE, { recursive: true, force: true });
  await rm(OUT_ZIP, { force: true });
  await mkdir(STAGE, { recursive: true });

  // 1) ルート直下
  await cp(resolve(ROOT, 'manifest.json'), resolve(STAGE, 'manifest.json'));
  await cp(resolve(ROOT, 'icons'), resolve(STAGE, 'icons'), { recursive: true });
  await cp(resolve(ROOT, '_locales'), resolve(STAGE, '_locales'), { recursive: true });

  // 2) dist の中身を zip ルートに展開
  await mkdir(resolve(STAGE, 'src'), { recursive: true });
  await cp(resolve(DIST, 'src/popup.html'), resolve(STAGE, 'src/popup.html'));
  await cp(resolve(DIST, 'src/options.html'), resolve(STAGE, 'src/options.html'));
  await cp(resolve(DIST, 'background.js'), resolve(STAGE, 'background.js'));
  await cp(resolve(DIST, 'assets'), resolve(STAGE, 'assets'), { recursive: true });

  // 3) zip 生成 (macOS / Linux の zip コマンド利用)
  const files = await listFilesRecursive(STAGE);
  if (files.length === 0) {
    throw new Error('stage is empty — nothing to zip');
  }
  const result = spawnSync('zip', ['-r', '-X', OUT_ZIP, '.'], {
    cwd: STAGE,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`zip exited with status ${result.status}`);
  }

  // 4) クリーンアップ + サマリ
  await rm(STAGE, { recursive: true, force: true });

  const s = await stat(OUT_ZIP);
  console.log(`\nPackaged: ${OUT_ZIP}`);
  console.log(`Size:     ${(s.size / 1024).toFixed(1)} KiB`);
  console.log(`Files:    ${files.length}`);
  for (const f of files.slice(0, 20)) console.log(`  - ${f}`);
  if (files.length > 20) console.log(`  ... (+${files.length - 20} more)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
