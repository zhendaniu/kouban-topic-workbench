const fs = require('fs');
const d = JSON.parse(fs.readFileSync('packs/2026-08-18.json', 'utf8'));
const bad = ['赋能','闭环','抓手','值得注意的是','总而言之','综上所述','在这个时代','在当今','在如今','不仅仅是','让我们','首先，其次','众所周知'];
let problems = 0;
let count = 0;
for (const tr of d.tracks) {
  for (const tp of tr.topics) {
    count++;
    if (!tp.scripts || tp.scripts.length !== 3) { console.log('✗ 稿数', tp.id, tp.scripts ? tp.scripts.length : 0); problems++; continue; }
    const angles = new Set();
    tp.scripts.forEach((s, i) => {
      if (!s.angle) { console.log('✗ angle缺失', tp.id, i+1); problems++; }
      if (angles.has(s.angle)) { console.log('✗ angle重复', tp.id, s.angle); problems++; }
      angles.add(s.angle);
      const t = (s.text || '').replace(/\s/g, '');
      if (t.length < 240 || t.length > 400) { console.log('✗ 字数', tp.id, '第'+(i+1)+'稿', t.length); problems++; }
      for (const w of bad) {
        if ((s.text || '').includes(w)) { console.log('✗ 禁用词', tp.id, '第'+(i+1)+'稿', w); problems++; }
      }
    });
    if (!tp.facts || !tp.facts.length) { console.log('✗ facts空', tp.id); problems++; }
  }
}
console.log('选题数', count, '稿数', count*3, '问题数', problems);
console.log(problems === 0 ? '✓ 自检全部通过' : '✗ 存在以上问题');
