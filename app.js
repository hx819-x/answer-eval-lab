function el(tag, text, cls) {
  const x = document.createElement(tag);
  if (text !== undefined) x.textContent = String(text);
  if (cls) x.className = cls;
  return x;
}
function download(name, text, type = "text/plain") {
  const a = el("a");
  const url = URL.createObjectURL(
    new Blob([text], { type: type + ";charset=utf-8" }),
  );
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function notify(text, error = false) {
  const box = document.getElementById("notice");
  box.textContent = text;
  box.className = "notice" + (error ? " error" : "");
  box.hidden = false;
}
function readSmallFile(file, limit = 1000000) {
  if (!file) throw Error("请选择文件");
  if (file.size > limit) throw Error("文件超过 1 MB 限制");
  return file.text();
}
const SAMPLE = {
  schema: 1,
  title: "中文内容助手 · 模拟评测集",
  labelA: "基础提示词版本",
  labelB: "增加事实与格式约束的版本",
  cases: [
    {
      id: "brief-01",
      prompt:
        "为周末读书会写一条 80 字以内的报名文案。不得补充未提供的名额、费用或嘉宾。",
      reference:
        "已知：周六 14:00，街角书店，共读一个短篇；报名入口在活动页。费用、人数、主持人均未知。判断重点：信息忠实、行动入口、字数。",
      answerA:
        "周六 14:00 来街角书店！名师带读、全程免费，限量 20 席，一起读完一个短篇。立即抢位，不见不散！",
      answerB:
        "周六 14:00，街角书店，一起读一个短篇，聊聊你的发现。想参加？请到活动页查看完整说明并报名。",
    },
    {
      id: "metrics-02",
      prompt:
        "两条内容分别获得 100 次曝光、10 次点击，以及 900 次曝光、45 次点击。计算整体点击率，并说明口径。",
      reference:
        "总点击 55；总曝光 1000；整体点击率 5.5%。不能把 10% 与 5% 简单平均。",
      answerA:
        "整体点击率为 (10+45)/(100+900)=5.5%。按总点击数除以总曝光数计算。",
      answerB: "第一条 10%，第二条 5%，平均后整体点击率为 7.5%。",
    },
    {
      id: "review-03",
      prompt:
        "某活动报名从上周 30 人增加到本周 45 人。本周同时换了标题和渠道。给出一句复盘结论和一个下一步建议。",
      reference:
        "报名增长 50%，但不能把原因单独归于标题或渠道。可提出保持其他因素一致的对照测试，或继续收集分渠道数据。",
      answerA: "报名增长了 50%，证明新标题更有效。建议全面使用新标题。",
      answerB:
        "报名由 30 人增至 45 人，增长 50%，但标题和渠道同时变化，无法确定单一原因。下一步保持渠道一致，对标题做对照测试。",
    },
  ],
};
const KEY = "answer-eval-lab:v1";
let session = null,
  index = 0;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch (e) {
    notify("浏览器未能保存，请导出备份。", true);
  }
}
function summary() {
  const x = EvalCore.summary(session),
    box = document.getElementById("summary");
  box.replaceChildren();
  [
    ["完成案例", x.completed + " / " + x.total],
    ["版本 A 胜出", x.winsA],
    ["版本 B 胜出", x.winsB],
    ["平局", x.ties],
  ].forEach(([a, b]) => {
    const card = el("div", undefined, "stat");
    card.append(el("span", a), el("strong", b));
    box.append(card);
  });
  document.getElementById("progress").textContent =
    "已完成 " +
    x.completed +
    " / " +
    x.total +
    " 个案例。得分为加权分 / 100；严重事实错误最高 40 分。";
}
function navigation() {
  const list = document.getElementById("cases");
  list.replaceChildren();
  session.dataset.cases.forEach((c, i) => {
    const r = session.records[i],
      b = el(
        "button",
        (EvalCore.complete(r.A) && EvalCore.complete(r.B) ? "✓ " : "○ ") +
          (i + 1) +
          " · " +
          c.id,
        i === index ? "active" : "",
      );
    b.onclick = () => {
      index = i;
      render();
    };
    list.append(b);
  });
}
function render() {
  const c = session.dataset.cases[index],
    r = session.records[index];
  document.getElementById("dataset-name").textContent = session.dataset.title;
  document.getElementById("case-title").textContent =
    "02 / 案例 " + (index + 1) + " · " + c.id;
  document.getElementById("prompt").textContent = c.prompt;
  document.getElementById("reference").textContent = c.reference;
  navigation();
  const answers = document.getElementById("answers");
  answers.replaceChildren();
  r.order.forEach((key, i) => {
    const rating = r[key],
      panel = el("section", undefined, "panel answer");
    const label = r.revealed
      ? key === "A"
        ? session.dataset.labelA
        : session.dataset.labelB
      : "候选回答 " + (i + 1);
    panel.append(
      el("h2", label),
      el("p", c["answer" + key], "answer-text pre"),
    );
    const fields = el("div", undefined, "score-fields");
    const total = el("p", undefined, "score-total");
    function update() {
      save();
      navigation();
      summary();
      const n = EvalCore.score(rating);
      total.textContent =
        n === null
          ? "请完成三个维度评分并填写依据"
          : "当前得分：" + n + " / 100";
      document.getElementById("reveal").disabled = !(
        EvalCore.complete(r.A) && EvalCore.complete(r.B)
      );
    }
    for (const [k, name] of EvalCore.RUBRIC) {
      const wrap = el("label", name, "field"),
        select = el("select");
      select.setAttribute("aria-label", label + " " + name);
      const empty = el("option", "待评");
      empty.value = "";
      select.append(empty);
      for (let n = 1; n <= 5; n++) {
        const o = el("option", n + " 分");
        o.value = n;
        select.append(o);
      }
      select.value = rating[k] ?? "";
      select.onchange = () => {
        rating[k] = select.value ? Number(select.value) : null;
        update();
      };
      wrap.append(select);
      fields.append(wrap);
    }
    const check = el("label", undefined, "check"),
      input = el("input");
    input.type = "checkbox";
    input.checked = rating.critical;
    input.onchange = () => {
      rating.critical = input.checked;
      update();
    };
    check.append(input, el("span", "存在严重事实错误（总分上限 40）"));
    const noteWrap = el("label", "判断依据（必填）", "field"),
      note = el("textarea");
    note.maxLength = 2000;
    note.placeholder = "引用回答中的具体问题或优点，说明为什么给这个分数。";
    note.value = rating.note;
    note.oninput = () => {
      rating.note = note.value;
      update();
    };
    noteWrap.append(note);
    total.textContent =
      EvalCore.score(rating) === null
        ? "请完成三个维度评分并填写依据"
        : "当前得分：" + EvalCore.score(rating) + " / 100";
    panel.append(fields, check, noteWrap, total);
    answers.append(panel);
  });
  document.getElementById("previous").disabled = index === 0;
  document.getElementById("next").disabled =
    index === session.dataset.cases.length - 1;
  document.getElementById("reveal").disabled = !(
    EvalCore.complete(r.A) && EvalCore.complete(r.B)
  );
  document.getElementById("reveal").textContent = r.revealed
    ? "已揭晓版本"
    : "揭晓当前版本";
  summary();
}
document.getElementById("previous").onclick = () => {
  index--;
  render();
};
document.getElementById("next").onclick = () => {
  index++;
  render();
};
document.getElementById("reveal").onclick = () => {
  session.records[index].revealed = true;
  save();
  render();
  notify("当前版本已揭晓。之后的评分修改不再属于盲评。");
};
document.getElementById("demo").onclick = () => {
  if (!confirm("开始新的模拟评测？当前记录将被替换，请先导出需要保留的数据。"))
    return;
  session = EvalCore.create(SAMPLE);
  index = 0;
  save();
  render();
  notify("已建立新评测。候选顺序随机，版本信息暂时隐藏。");
};
document.getElementById("file").onchange = async (e) => {
  try {
    const input = JSON.parse(await readSmallFile(e.target.files[0]));
    const next = input.kind ? EvalCore.validate(input) : EvalCore.create(input);
    if (!confirm("替换当前评测记录？请确认已有记录已导出。")) return;
    session = next;
    index = 0;
    save();
    render();
    notify("评测文件已导入。");
  } catch (e) {
    notify("导入失败：" + e.message, true);
  } finally {
    e.target.value = "";
  }
};
document.getElementById("export").onclick = () => {
  download(
    "evaluation-session.json",
    JSON.stringify(EvalCore.validate(session), null, 2),
    "application/json",
  );
  notify("已导出全部案例、评分和版本映射。导出文件会揭示版本。");
};
document.getElementById("csv-export").onclick = () => {
  download(
    "evaluation-scores.csv",
    "\uFEFF" + EvalCore.csv(session),
    "text/csv",
  );
  notify("评分 CSV 已导出，包含版本名称。");
};
document.getElementById("clear").onclick = () => {
  if (!confirm("清空本地评分并显示新的模拟评测？")) return;
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
  session = EvalCore.create(SAMPLE);
  index = 0;
  render();
  notify("已清空保存的评分。");
};
try {
  const raw = localStorage.getItem(KEY);
  session = raw ? EvalCore.validate(JSON.parse(raw)) : EvalCore.create(SAMPLE);
} catch (e) {
  session = EvalCore.create(SAMPLE);
  notify("旧记录无法读取，已显示新的模拟评测。", true);
}
render();
