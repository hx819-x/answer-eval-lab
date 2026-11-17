(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EvalCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const RUBRIC = [
    ["accuracy", "准确性", 40],
    ["relevance", "任务完成度", 35],
    ["clarity", "清晰度", 25],
  ];
  function str(v, label, max = 8000) {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      throw Error(label + "为空或过长");
    return v.trim();
  }
  function dataset(x) {
    if (
      !x ||
      x.schema !== 1 ||
      !Array.isArray(x.cases) ||
      x.cases.length < 1 ||
      x.cases.length > 100
    )
      throw Error("评测集需 schema:1 且包含 1–100 个案例");
    const ids = new Set();
    return {
      schema: 1,
      title: str(x.title, "标题", 100),
      labelA: str(x.labelA, "版本 A 名称", 100),
      labelB: str(x.labelB, "版本 B 名称", 100),
      cases: x.cases.map((c) => {
        const id = str(c.id, "案例 ID", 50);
        if (ids.has(id)) throw Error("案例 ID 重复");
        ids.add(id);
        return {
          id,
          prompt: str(c.prompt, "任务"),
          reference: str(c.reference, "参考信息"),
          answerA: str(c.answerA, "回答 A"),
          answerB: str(c.answerB, "回答 B"),
        };
      }),
    };
  }
  function empty() {
    return {
      accuracy: null,
      relevance: null,
      clarity: null,
      critical: false,
      note: "",
    };
  }
  function create(input, random = Math.random) {
    const d = dataset(input);
    return {
      schema: 1,
      kind: "answer-eval-session",
      dataset: d,
      records: d.cases.map((c) => ({
        id: c.id,
        order: random() < 0.5 ? ["A", "B"] : ["B", "A"],
        revealed: false,
        A: empty(),
        B: empty(),
      })),
    };
  }
  function validRating(r) {
    if (
      !r ||
      typeof r.critical !== "boolean" ||
      typeof r.note !== "string" ||
      r.note.length > 2000
    )
      throw Error("评分记录格式无效");
    const out = { critical: r.critical, note: r.note };
    for (const [k] of RUBRIC) {
      if (r[k] !== null && (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 5))
        throw Error("分数必须为 1–5 或 null");
      out[k] = r[k];
    }
    return out;
  }
  function validate(x) {
    if (!x || x.schema !== 1 || x.kind !== "answer-eval-session")
      throw Error("不是评测备份格式");
    const d = dataset(x.dataset);
    if (!Array.isArray(x.records) || x.records.length !== d.cases.length)
      throw Error("评分记录数量错误");
    const records = d.cases.map((c, i) => {
      const r = x.records[i];
      if (
        !r ||
        r.id !== c.id ||
        !Array.isArray(r.order) ||
        r.order.length !== 2 ||
        [...r.order].sort().join("") !== "AB" ||
        typeof r.revealed !== "boolean"
      )
        throw Error("案例映射或顺序无效");
      return {
        id: c.id,
        order: [...r.order],
        revealed: r.revealed,
        A: validRating(r.A),
        B: validRating(r.B),
      };
    });
    return { schema: 1, kind: x.kind, dataset: d, records };
  }
  function complete(r) {
    return (
      RUBRIC.every(([k]) => Number.isInteger(r[k]) && r[k] >= 1 && r[k] <= 5) &&
      typeof r.note === "string" &&
      r.note.trim().length > 0
    );
  }
  function score(r) {
    if (!complete(r)) return null;
    let n = RUBRIC.reduce((sum, [k, , w]) => sum + (r[k] / 5) * w, 0);
    if (r.critical) n = Math.min(40, n);
    return Math.round(n * 10) / 10;
  }
  function summary(s) {
    const done = s.records.filter((r) => complete(r.A) && complete(r.B));
    let a = 0,
      b = 0,
      ties = 0,
      totalA = 0,
      totalB = 0;
    for (const r of done) {
      const sa = score(r.A),
        sb = score(r.B);
      totalA += sa;
      totalB += sb;
      if (sa > sb) a++;
      else if (sb > sa) b++;
      else ties++;
    }
    return {
      completed: done.length,
      total: s.records.length,
      winsA: a,
      winsB: b,
      ties,
      meanA: done.length ? totalA / done.length : null,
      meanB: done.length ? totalB / done.length : null,
    };
  }
  function cell(v) {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  }
  function csv(s) {
    const x = validate(s),
      rows = [
        [
          "case_id",
          "version",
          "accuracy",
          "relevance",
          "clarity",
          "critical",
          "note",
          "score",
          "pair_complete",
          "revealed",
        ],
      ];
    for (const r of x.records)
      for (const key of ["A", "B"]) {
        const q = r[key];
        rows.push([
          r.id,
          key === "A" ? x.dataset.labelA : x.dataset.labelB,
          q.accuracy,
          q.relevance,
          q.clarity,
          q.critical,
          q.note,
          score(q),
          complete(r.A) && complete(r.B),
          r.revealed,
        ]);
      }
    return rows.map((r) => r.map(cell).join(",")).join("\n");
  }
  return { RUBRIC, dataset, create, validate, complete, score, summary, csv };
});
