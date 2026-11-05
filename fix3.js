const fs = require('fs');
const path = require('path');
const f = path.join(__dirname,'packs','2026-11-05.json');
const data = JSON.parse(fs.readFileSync(f,'utf8'));

// 第二轮补字：仅针对仍 <240 的 6 稿
const T = {
  tv2: { 2: "，省下的钱实打实进了自己兜里。" },
  tv5: { 2: "，规则越简单，越卖得动，这是平台今年最该学的。" },
  ai4: { 1: "，门槛越低越拼内容，观众从不缺片子，缺的是愿意看下去的好片子。", 2: "，回归内容本身，才是这轮降本后最稳的活法。" },
  ai5: { 0: "，先把边界划清再放手用，比盲目尝鲜靠谱得多，能力再强也得有人看住。", 2: "，边界即自由，管得清楚才用得放心。" }
};

const BAD = ['赋能','闭环','抓手','值得注意的是','总而言之','综上所述','在这个时代','在当今','在如今','不仅仅是','让我们','首先，其次','众所周知'];
let problems = [];
data.tracks.forEach(tk => tk.topics.forEach(tp => {
  const m = T[tp.id];
  const sc = tp.scripts || [];
  sc.forEach((s,i) => { if (m && m[i]) s.text = (s.text||'') + m[i]; });
  sc.forEach((s,i) => {
    const n = (s.text||'').replace(/\s/g,'').length;
    if (n<240||n>400) problems.push(`[${tp.id}] 第${i+1}稿 ${n}字`);
    BAD.forEach(b=>{ if((s.text||'').includes(b)) problems.push(`[${tp.id}] 第${i+1}稿 禁用词「${b}」`); });
  });
}));
console.log('二轮补字后问题数:', problems.length);
problems.forEach(p=>console.log('  - '+p));
fs.writeFileSync(f, JSON.stringify(data,null,2),'utf8');
console.log('已更新', f);
