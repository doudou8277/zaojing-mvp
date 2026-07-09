#!/usr/bin/env node
/**
 * 检查 Vite 构建产物体积是否超出预算
 * 在 CI 中运行，超限时以非零退出码失败
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const budgetPath = path.join(__dirname, '..', '.bundle-budget.json');

if (!fs.existsSync(distDir)) {
  console.error('dist/ 目录不存在，请先运行 vite build');
  process.exit(1);
}

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf-8'));
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets/ 目录不存在');
  process.exit(1);
}

// 收集所有 JS chunk 的体积
const chunks = [];
for (const file of fs.readdirSync(assetsDir)) {
  if (!file.endsWith('.js')) continue;
  const filePath = path.join(assetsDir, file);
  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath);

  // 使用 zlib 计算 gzip 体积
  const gzipped = zlib.gzipSync(content);
  const gzipSize = gzipped.length;

  chunks.push({
    name: file.replace(/-[\w-]{8}\.js$/, '').replace(/\.js$/, ''),
    file,
    rawSize: stat.size,
    gzipSize: gzipSize,
    gzipKB: Math.round(gzipSize / 1024 * 100) / 100
  });
}

// 检查各 chunk 预算
let failed = false;
console.log('Chunk 体积检查（gzip）:');
console.log('─'.repeat(60));

for (const chunk of chunks) {
  const budgetEntry = budget.budgets[chunk.name];
  const max = budgetEntry?.max;
  const status = max ? (chunk.gzipKB > max ? '✗ 超限' : '✓ 达标') : '— 无预算';
  const limit = max ? `/${max}KB` : '';
  console.log(`  ${chunk.name.padEnd(20)} ${String(chunk.gzipKB).padStart(8)}KB${limit.padEnd(10)} ${status}`);

  if (max && chunk.gzipKB > max) {
    console.error(`  ✗ ${chunk.name} 超出预算: ${chunk.gzipKB}KB > ${max}KB`);
    failed = true;
  }
}

// 检查总体积
const totalGzipKB = chunks.reduce((sum, c) => sum + c.gzipKB, 0);
const totalMax = budget.budgets.total?.max;
console.log('─'.repeat(60));
console.log(`  ${'total'.padEnd(20)} ${String(Math.round(totalGzipKB * 100) / 100).padStart(8)}KB/${totalMax}KB`);
if (totalMax && totalGzipKB > totalMax) {
  console.error(`  ✗ 总体积超出预算: ${totalGzipKB}KB > ${totalMax}KB`);
  failed = true;
}

if (failed) {
  console.error('\n✗ Bundle 体积预算检查失败');
  process.exit(1);
} else {
  console.log('\n✓ 所有 chunk 体积在预算范围内');
}
