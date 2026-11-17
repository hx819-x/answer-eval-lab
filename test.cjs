const test = require("node:test"),
  assert = require("node:assert/strict"),
  P = require("./core.js"),
  sample = require("./sample.json");
const full = {
  accuracy: 5,
  relevance: 5,
  clarity: 5,
  note: "符合参考信息",
  critical: false,
};
test("all dimensions map to 100 and critical errors cap score", () => {
  assert.equal(P.score(full), 100);
  assert.equal(P.score({ ...full, critical: true }), 40);
  assert.equal(P.score({ ...full, accuracy: 1 }), 68);
});
test("missing scores and notes are not silently scored as zero", () => {
  assert.equal(P.score({ ...full, accuracy: null }), null);
  assert.equal(P.score({ ...full, note: " " }), null);
  const x = P.summary(P.create(sample));
  assert.equal(x.completed, 0);
  assert.equal(x.meanA, null);
});
test("randomized display preserves actual version identity", () => {
  const a = P.create(sample, () => 0),
    b = P.create(sample, () => 1);
  assert.deepEqual(a.records[0].order, ["A", "B"]);
  assert.deepEqual(b.records[0].order, ["B", "A"]);
  assert.equal(b.dataset.cases[0].answerA, sample.cases[0].answerA);
});
test("only complete pairs count toward summary", () => {
  const s = P.create(sample);
  s.records[0].A = { ...full };
  s.records[0].B = { ...full, accuracy: 3 };
  s.records[1].A = { ...full };
  const x = P.summary(s);
  assert.equal(x.completed, 1);
  assert.equal(x.winsA, 1);
  assert.equal(x.meanB, 84);
});
test("backup preserves scores, notes and mapping", () => {
  const s = P.create(sample);
  s.records[0].A = { ...full };
  s.records[0].revealed = true;
  assert.deepEqual(P.validate(JSON.parse(JSON.stringify(s))), s);
});
test("bad score and duplicate case ids are rejected", () => {
  const s = P.create(sample);
  s.records[0].A.accuracy = 6;
  assert.throws(() => P.validate(s));
  assert.throws(() =>
    P.dataset({ ...sample, cases: [sample.cases[0], sample.cases[0]] }),
  );
});
test("corrupted mapping and missing reference fail validation", () => {
  const s = P.create(sample);
  s.records[0].order = ["A", "A"];
  assert.throws(() => P.validate(s));
  assert.throws(() =>
    P.dataset({ ...sample, cases: [{ ...sample.cases[0], reference: "" }] }),
  );
});
test("CSV guards formulas and quotes reviewer evidence", () => {
  const s = P.create(sample);
  s.records[0].A = { ...full, note: '=HYPERLINK("x")' };
  const csv = P.csv(s);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /""x""/);
});
