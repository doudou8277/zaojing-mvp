/**
 * 原子写入工具模块
 * 采用"写临时文件 + rename"模式，确保进程崩溃时不会产生半写文件导致数据损坏。
 * rename 在 POSIX 系统上是原子操作，读者永远不会看到不一致的中间状态。
 */

const fs = require('fs');
const path = require('path');

/**
 * 同步原子写入任意数据到文件
 * @param {string} filePath - 目标文件路径
 * @param {string|Buffer} data - 要写入的数据
 * @param {object|string} [options] - fs.writeFileSync 的选项（编码等）
 */
function writeAtomic(filePath, data, options = {}) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data, options);
  fs.renameSync(tmpPath, filePath);
}

/**
 * 异步原子写入任意数据到文件
 * @param {string} filePath - 目标文件路径
 * @param {string|Buffer} data - 要写入的数据
 * @param {object|string} [options] - fs.writeFile 的选项（编码等）
 * @returns {Promise<void>}
 */
async function writeAtomicAsync(filePath, data, options = {}) {
  const tmpPath = filePath + '.tmp';
  await fs.promises.writeFile(tmpPath, data, options);
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * 同步原子写入 JSON 对象到文件（带 2 空格缩进格式化）
 * @param {string} filePath - 目标文件路径
 * @param {*} obj - 要序列化为 JSON 的对象
 */
function writeJsonAtomic(filePath, obj) {
  writeAtomic(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

/**
 * 异步原子写入 JSON 对象到文件（带 2 空格缩进格式化）
 * @param {string} filePath - 目标文件路径
 * @param {*} obj - 要序列化为 JSON 的对象
 * @returns {Promise<void>}
 */
async function writeJsonAtomicAsync(filePath, obj) {
  await writeAtomicAsync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

module.exports = { writeAtomic, writeAtomicAsync, writeJsonAtomic, writeJsonAtomicAsync };
