#!/usr/bin/env node
/**
 * 无头冒烟测试：用最小 DOM stub 真实执行 dist/index.html 里的内联 JS，
 * 跑通 boot() 全流程 + 模拟用户操作，抓运行时错误。
 * 用法：node smoke-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
const code = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).join('\n');
const jsonBlocks = {};
[...html.matchAll(/<script id="([^"]+)" type="application\/json">([\s\S]*?)<\/script>/g)]
  .forEach(m => { jsonBlocks[m[1]] = m[2]; });

const ids = [...new Set([...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]))];

let warns = [];
function mkEl(id) {
  const cls = new Set();
  const el = {
    id, innerHTML: '', textContent: jsonBlocks[id] || '', value: '', files: null,
    dataset: {}, style: {}, onclick: null, onchange: null,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : f; on ? cls.add(c) : cls.delete(c); return on; },
      contains: c => cls.has(c)
    },
    _cls: cls,
    appendChild() {}, removeChild() {}, select() {}, click() {}, focus() {},
    addEventListener() {}, removeEventListener() {},
    scrollTop: 0, clientHeight: 600, scrollHeight: 1200,
    get nextElementSibling() { return mkEl(id + '_next'); }
  };
  return el;
}
const store = {};
ids.forEach(i => { store[i] = mkEl(i); });

const storage = new Map();
const doc = {
  getElementById: id => { if (!store[id]) { warns.push('getElementById 未命中: ' + id); store[id] = mkEl(id); } return store[id]; },
  querySelectorAll: sel => {
    if (sel === '.pane') return ['p-today', 'p-topics', 'p-scripts', 'p-refs'].map(i => store[i]);
    if (sel === '.nav button') return ['today', 'topics', 'scripts', 'refs'].map(p => { const e = mkEl('nav_' + p); e.dataset.p = p; return e; });
    return [];
  },
  createElement: () => mkEl('tmp'),
  addEventListener() {},
  execCommand: () => true,
  body: { style: {}, appendChild() {}, removeChild() {} }
};

const sandbox = {
  document: doc, console,
  window: { isSecureContext: false, scrollTo() {} },
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k)
  },
  navigator: {}, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
  Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  FileReader: function () { this.readAsText = () => {}; },
  Date, JSON, Math, Object, Array, String, Number, RegExp, Error, parseInt, parseFloat, isNaN
};
sandbox.window.scrollTo = () => {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const results = [];
function chk(name, fn) {
  try { const r = fn(); results.push(['PASS', name, r || '']); }
  catch (e) { results.push(['FAIL', name, e.message]); }
}

chk('内联脚本执行 + boot() 首次加载', () => {
  vm.runInContext(code, sandbox, { filename: 'inline.js' });
  return '';
});

chk('今日待办渲染出内容', () => {
  const h = store.tlist.innerHTML;
  if (!h || h.length < 40) throw new Error('tlist 为空');
  return h.length + ' 字符';
});

chk('统计卡渲染 4 项', () => {
  const n = (store.stats.innerHTML.match(/class="stat/g) || []).length;
  if (n !== 4) throw new Error('统计卡 ' + n + ' 项，应为 4');
  return '4 项';
});

chk('选题池渲染 10 个选题', () => {
  const n = (store.topicList.innerHTML.match(/class="card topic/g) || []).length;
  if (n !== 10) throw new Error('渲染 ' + n + ' 个选题，应为 10');
  return '10 个';
});

chk('口播稿渲染 30 篇', () => {
  const n = (store.scriptList.innerHTML.match(/class="sc"/g) || []).length;
  if (n !== 30) throw new Error('渲染 ' + n + ' 篇，应为 30');
  return '30 篇';
});

chk('字数/时长标注正确', () => {
  const m = store.scriptList.innerHTML.match(/(\d+) 字 · 约 (\d+) 秒/);
  if (!m) throw new Error('未渲染字数时长');
  const w = +m[1], s = +m[2];
  if (w < 240 || w > 400) throw new Error('字数异常 ' + w);
  if (s < 45 || s > 85) throw new Error('时长异常 ' + s + '秒，应在一分钟量级');
  return m[0];
});

chk('切换赛道筛选（旅游）', () => {
  vm.runInContext("setTrack('travel')", sandbox);
  const n = (store.topicList.innerHTML.match(/class="card topic/g) || []).length;
  if (n !== 5) throw new Error('旅游赛道 ' + n + ' 个选题，应为 5');
  vm.runInContext("setTrack('all')", sandbox);
  return '5 个';
});

chk('标记状态：选用 → 已拍 → 已发', () => {
  const id = vm.runInContext("allScripts(PACK_TODAY.date)[0].id", sandbox);
  ['pick', 'shot', 'pub'].forEach(s => vm.runInContext(`setSt('${id}','${s}')`, sandbox));
  const got = vm.runInContext(`stOf('${id}')`, sandbox);
  if (got !== 'pub') throw new Error('状态未落到 pub，实际 ' + got);
  if (!storage.has('wb_kb_status_v1')) throw new Error('状态未写入 localStorage');
  return id.split('|').slice(1).join('/') + ' → 已发';
});

chk('状态筛选器工作', () => {
  vm.runInContext("setStF('pub')", sandbox);
  const n = (store.scriptList.innerHTML.match(/class="sc"/g) || []).length;
  if (n !== 1) throw new Error('已发筛选出 ' + n + ' 条，应为 1');
  vm.runInContext("setStF('all')", sandbox);
  return '1 条';
});

chk('待办自动顺延（模拟昨天选用未拍）', () => {
  const id = vm.runInContext("allScripts(PACK_TODAY.date)[3].id", sandbox);
  const y = new Date(Date.now() - 86400000);
  const yd = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  vm.runInContext(`ST['${id}']={s:'pick',t:'${yd}'};lsSet(K.st,ST);renderAll()`, sandbox);
  const h = store.tlist.innerHTML;
  if (!h.includes('titem od')) throw new Error('逾期项未标红');
  if (!/选用了 \d+ 天还没拍/.test(h)) throw new Error('逾期文案未生成');
  return '逾期标红 + 一键处理按钮已出';
});

chk('灵感库增删', () => {
  store.rTitle.value = '某条爆款：三个免签国盘点';
  store.rTrack.value = 'travel';
  store.rAuthor.value = '测试账号';
  store.rLink.value = 'https://example.com/x';
  store.rNote.value = '开头 3 秒直接甩地图，值得抄';
  vm.runInContext('addRef()', sandbox);
  let n = vm.runInContext('RF.length', sandbox);
  if (n !== 1) throw new Error('新增失败');
  if (!store.refList.innerHTML.includes('三个免签国盘点')) throw new Error('列表未渲染');
  const rid = vm.runInContext('RF[0].id', sandbox);
  vm.runInContext(`delRef('${rid}')`, sandbox);
  if (vm.runInContext('RF.length', sandbox) !== 0) throw new Error('删除失败');
  return '增删正常';
});

chk('灵感库标题为空时拦截', () => {
  store.rTitle.value = '';
  vm.runInContext('addRef()', sandbox);
  if (vm.runInContext('RF.length', sandbox) !== 0) throw new Error('空标题被写入了');
  return '已拦截';
});

chk('XSS 转义生效', () => {
  store.rTitle.value = '<img src=x onerror=alert(1)>';
  vm.runInContext('addRef()', sandbox);
  const h = store.refList.innerHTML;
  if (h.includes('<img src=x')) throw new Error('未转义，存在 XSS 风险');
  if (!h.includes('&lt;img')) throw new Error('转义结果异常');
  vm.runInContext('RF=[];lsSet(K.rf,RF);renderRefs()', sandbox);
  return '已转义';
});

chk('导入导出往返一致', () => {
  const before = vm.runInContext('JSON.stringify(ST)', sandbox);
  vm.runInContext("ST={};RF=[];", sandbox);
  vm.runInContext(`(function(){var d=JSON.parse('${before.replace(/'/g, "\\'")}');ST=Object.assign({},d);lsSet(K.st,ST);renderAll()})()`, sandbox);
  const after = vm.runInContext('JSON.stringify(ST)', sandbox);
  if (after !== before) throw new Error('往返数据不一致');
  return Object.keys(JSON.parse(after)).length + ' 条标记还原';
});

chk('清空数据需二次确认（不直接执行）', () => {
  vm.runInContext('askClear()', sandbox);
  if (!store.mask._cls.has('on')) throw new Error('未弹确认框');
  if (!store.mkP.textContent.includes('导出备份')) throw new Error('确认文案未提示先备份');
  const stillThere = vm.runInContext('Object.keys(ST).length', sandbox);
  if (stillThere === 0) throw new Error('未确认就清空了');
  vm.runInContext('closeMask()', sandbox);
  return '弹窗拦截正常';
});

chk('30 条数据触发备份提醒', () => {
  vm.runInContext(`(function(){for(var i=0;i<31;i++){RF.push({id:'x'+i,title:'t'+i,track:'ai',star:3,date:today()})}lsSet(K.rf,RF);checkTip()})()`, sandbox);
  if (!store.tipbar._cls.has('on')) throw new Error('未触发备份提醒');
  if (!store.tipTx.textContent.includes('导出')) throw new Error('提醒文案不对');
  return store.tipTx.textContent.slice(0, 24) + '…';
});

chk('念稿模式打开/关闭', () => {
  vm.runInContext("openTele('测试标题','测试正文内容')", sandbox);
  if (!store.tele._cls.has('on')) throw new Error('未打开');
  if (store.teleTx.textContent !== '测试正文内容') throw new Error('正文未注入');
  vm.runInContext('teleFont(4);closeTele()', sandbox);
  if (store.tele._cls.has('on')) throw new Error('未关闭');
  return '开合 + 字号调节正常';
});

chk('页面切换', () => {
  ['topics', 'scripts', 'refs', 'today'].forEach(p => vm.runInContext(`go('${p}')`, sandbox));
  if (!store['p-today']._cls.has('on')) throw new Error('回到今天失败');
  return '4 个页面切换正常';
});

chk('历史归档写入 localStorage', () => {
  const hs = JSON.parse(storage.get('wb_kb_history_v1'));
  const d = vm.runInContext('PACK_TODAY.date', sandbox);
  if (!hs[d]) throw new Error('今日内容包未归档');
  if (!hs[d].tracks || hs[d].tracks.length !== 2) throw new Error('归档结构异常');
  return Object.keys(hs).join(', ');
});

const fail = results.filter(r => r[0] === 'FAIL');
console.log('\n无头冒烟测试 ' + results.length + ' 项\n' + '─'.repeat(62));
results.forEach(([s, n, d]) => console.log((s === 'PASS' ? '  ✓ ' : '  ✗ ') + n.padEnd(30, ' ') + (d ? '  ' + d : '')));
console.log('─'.repeat(62));
if (warns.length) console.log('提示: ' + [...new Set(warns)].join('; '));
console.log(fail.length ? `✗ ${fail.length} 项失败` : `✓ 全部 ${results.length} 项通过`);
process.exit(fail.length ? 1 : 0);
