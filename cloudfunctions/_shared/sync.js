/**
 * _shared 公共模块同步脚本。
 *
 * 云函数是独立部署单元（微信开发者工具按函数目录上传），无法跨目录
 * require 兄弟目录的文件，因此把本目录下的公共模块软拷贝到每个
 * 云函数目录下的 `_shared/`，函数内统一 `require('./_shared/...')`。
 *
 * 用法：在仓库任意位置执行 `node cloudfunctions/_shared/sync.js`
 */

const fs = require('fs');
const path = require('path');

// 需要同步的公共模块文件
const FILES = ['constants.js', 'validate.js'];

const sharedDir = __dirname;
const functionsRoot = path.dirname(sharedDir);

fs.readdirSync(functionsRoot).forEach((name) => {
  const dir = path.join(functionsRoot, name);
  if (name === '_shared' || !fs.statSync(dir).isDirectory()) return;
  const targetDir = path.join(dir, '_shared');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
  FILES.forEach((file) => {
    fs.copyFileSync(path.join(sharedDir, file), path.join(targetDir, file));
  });
  console.log(`已同步 -> ${name}/_shared/`);
});
