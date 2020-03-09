const _ = require('lodash');
const path = require('path');
const fs = require('fs')
const fse = require('fs-extra')
const debug = require('debug')('copyPreset')

/**
 * 需更新的文件作为数组，放入R变量中
 * @param {* } prj 工作空间中有很多项目，指定项目名称， 比如 ebx，或 drone
 * @param {* } ver 为项目配置文件中的版本号
 */
async function copyPreset(dest) {
  let R = null;
  try {
    const pm = [];
    const src = path.resolve(__dirname, '../../preset');
    let dir = '';
    const tree = await getFile(src, dir, dest, pm);
    R = await Promise.all(pm);
    // console.log(tree);
  } catch (err) {
    console.log(`copyPreset exp:${err.message}`);
  }

  // console.log(next);
  return R;
}

/**
 * 对指定文件夹下的子文件夹和文件进行递归
 * 对于子目录文件， 生成嵌套对象， 如
 * {项目目录: {子目录:{xxx:e8461954cbf736f2e1d71cb84c72c2b4}}
 * @param {*} src 源文件路径
 * @param {*} dest 目的文件路径
 * @param {*} dir 目录
 * @param {*} pm 拷贝Promise数组，使用异步拷贝
 */
async function getFile(src, dir, dest, pm) {
  const sp = path.join(src, dir);
  const R = {path: sp};
  try {
    debug.extend('getFile')(`src:${src} dir:${dir} dest:${dest}`);

    if (!fs.existsSync(sp))
      return R;

    // 获得当前文件夹下的所有的文件夹和文件，赋值给目录和文件数组变量
    const [dirs, files] = _(fs.readdirSync(sp))
      .partition(p => fs.statSync(path.join(src, dir, p)).isDirectory());
    
    debug.extend('getFile dir:')(dirs);
    // 对子文件夹进行递归，使用了await，串行同步执行
    for (let d of dirs) { // eslint-disable-line
      let p = path.join(dest, path.join(dir, d));
      fse.ensureDirSync(p);
      R[d] = await getFile(src, path.join(dir, d), dest, pm); // path.join(src, d)
    }

    debug.extend('getFile file:')(files);
    // 当前目录下所有文件名进行同步hash计算
    for (let f of files) { // eslint-disable-line
      R[f] = path.join(src, dir, f);
      pm.push(fse.copy(R[f], path.join(dest, dir, f), {overwrite: true}));
    }
  } catch (e) {
    console.log(`getFile exp:${e.message}`);
  }

  return R;
}

module.exports = {
  copyPreset
};

// test
// copyPreset('C:\\Users\\walter\\prj\\js\\wia\\tmp\\wia');
