#!/usr/bin/env node
/**
 * 构建单文件工作台：template.html + packs/*.json -> dist/index.html
 * 用法：node build.js
 * 规则：packs 目录下日期最大的作为「今日内容包」，其余最近 6 天作为历史归档一并内嵌。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PACKS = path.join(ROOT, 'packs');
const TPL = path.join(ROOT, 'template.html');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'index.html');

const HISTORY_KEEP = 6; // 今日之外再内嵌几天

function safeJson(obj) {
  // 内嵌进 <script type="application/json"> 需要转义 < 防止提前闭合标签
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, m =>
    m === '\u2028' ? '\\u2028' : '\\u2029');
}

function main() {
  if (!fs.existsSync(PACKS)) throw new Error('packs 目录不存在: ' + PACKS);
  const files = fs.readdirSync(PACKS)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (!files.length) throw new Error('packs 目录里没有 YYYY-MM-DD.json 内容包');

  const load = f => JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));

  const today = load(files[0]);
  const history = {};
  files.slice(1, 1 + HISTORY_KEEP).forEach(f => {
    const p = load(f);
    history[p.date] = p;
  });

  // 体检：结构与内容规范
  const problems = [];
  let topicN = 0, scriptN = 0;
  (today.tracks || []).forEach(tk => {
    if (!tk.id || !tk.name) problems.push('赛道缺少 id/name');
    (tk.topics || []).forEach(tp => {
      topicN++;
      ['id', 'title', 'hook', 'why', 'heat'].forEach(k => {
        if (!tp[k]) problems.push(`[${tk.name}] 选题缺字段 ${k}: ${tp.title || tp.id}`);
      });
      if (!(tp.facts || []).length) problems.push(`[${tk.name}] 选题无事实清单: ${tp.title}`);
      const sc = tp.scripts || [];
      if (sc.length !== 3) problems.push(`[${tk.name}] ${tp.title} 稿件数 ${sc.length}，应为 3`);
      sc.forEach((s, i) => {
        scriptN++;
        const n = (s.text || '').replace(/\s/g, '').length;
        if (!s.angle) problems.push(`[${tk.name}] ${tp.title} 第${i + 1}稿缺 angle`);
        if (n < 240 || n > 400) problems.push(`[${tk.name}] ${tp.title} 第${i + 1}稿 ${n} 字，超出 240-400 区间`);
        // AI 味禁用词自检；教学类稿件把禁用词当反面教材引用时，可在稿内标 "allowBad": true 跳过
        if (!s.allowBad) {
          const bad = ['赋能', '闭环', '抓手', '值得注意的是', '总而言之', '综上所述',
            '在这个时代', '在当今', '在如今', '不仅仅是', '让我们', '首先，其次', '众所周知'];
          bad.forEach(b => { if ((s.text || '').includes(b)) problems.push(`[${tk.name}] ${tp.title} 第${i + 1}稿含禁用词「${b}」`); });
        }
      });
    });
  });

  let html = fs.readFileSync(TPL, 'utf8');
  html = html.replace('__PACK_TODAY__', safeJson(today))
             .replace('__PACK_HISTORY__', safeJson(history));
  if (html.includes('__PACK_TODAY__') || html.includes('__PACK_HISTORY__'))
    throw new Error('模板占位符替换失败');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`✓ 构建完成 ${OUT}`);
  console.log(`  今日内容包: ${today.date}（${topicN} 选题 / ${scriptN} 稿）`);
  console.log(`  历史归档:   ${Object.keys(history).join(', ') || '无'}`);
  console.log(`  文件大小:   ${kb} KB（单文件，零外链）`);
  if (problems.length) {
    console.log(`\n⚠ 体检发现 ${problems.length} 处问题：`);
    problems.forEach(p => console.log('  - ' + p));
    process.exitCode = 0; // 只警告不阻断
  } else {
    console.log('  体检:       全部通过');
  }
}

main();
