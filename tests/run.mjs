import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  parseJSON,
  parseCSV,
  validate,
  importFiles,
  LIMIT,
} from "../src/input.ts";
import { audit } from "../src/policy.ts";
const read = (path) => readFileSync(path, "utf8");
const expected = JSON.parse(read("tests/expected.json"));
const cases = readdirSync("tests/cases").sort();
assert.deepEqual(cases, Object.keys(expected).sort());
assert.equal(cases.length, 20);
const records = [];
let fp = 0,
  fn = 0;
for (const file of cases) {
  const cfg = parseJSON(read("tests/cases/" + file));
  const actual = audit(cfg).map((r) => [r.id, r.code, r.status]);
  const reference = expected[file],
    ok = isDeepStrictEqual(actual, reference);
  const violated = (rows) => rows.some((r) => r[2] === "VIOLATION");
  if (violated(actual) && !violated(reference)) fp++;
  if (!violated(actual) && violated(reference)) fn++;
  records.push({ file, name: cfg.network_name, reference, actual, ok });
}
const demoText = read("examples/plant.json"),
  assets = read("examples/assets.csv"),
  rules = read("examples/rules.csv");
const model = () => JSON.parse(demoText);
const extra = [];
async function test(name, fn) {
  try {
    await fn();
    extra.push({ name, ok: true });
  } catch (e) {
    extra.push({ name, ok: false, error: String(e) });
    console.error(name, e);
  }
}
for (const [name, change] of [
  ["Нет списка устройств", (c) => delete c.assets],
  ["Неизвестная зона", (c) => (c.assets[0].zone = "X")],
  ["Дубль устройства", (c) => c.assets.push(c.assets[0])],
  ["Дубль зоны", (c) => (c.zones[1].id = "IT")],
  ["Дубль правила", (c) => c.access_rules.push(c.access_rules[0])],
  ["Отсутствует источник", (c) => (c.access_rules[0].source = "missing")],
  [
    "Отсутствует получатель",
    (c) => (c.access_rules[0].destination = "missing"),
  ],
  ["Неизвестное действие", (c) => (c.access_rules[0].action = "maybe")],
  ["Неизвестный протокол", (c) => (c.access_rules[0].protocol = "other")],
  ["Порт вне диапазона", (c) => (c.access_rules[0].port = 65536)],
  ["Обратный диапазон", (c) => (c.access_rules[0].port = "90-10")],
  ["Резервный ID", (c) => (c.assets[0].id = "ANY")],
  ["Лимит устройств", (c) => (c.assets = Array(201).fill(c.assets[0]))],
  [
    "Лимит правил",
    (c) => (c.access_rules = Array(1001).fill(c.access_rules[0])),
  ],
  ["Внешняя политика", (c) => (c.policy = {})],
  ["Неподдерживаемая версия", (c) => (c.schema_version = "2.0")],
])
  await test(name, () => {
    const c = model();
    change(c);
    assert.throws(() => validate(c));
  });
const file = (name, content) => new File([content], name);
for (const [name, files] of [
  ["Пустой файл", [file("empty.json", "")]],
  ["Повреждённый JSON", [file("bad.json", "{")]],
  ["Тип файла", [file("bad.html", demoText)]],
  ["Превышение 1 МиБ", [file("big.json", " ".repeat(LIMIT + 1))]],
  ["Неверный UTF-8", [file("bytes.json", new Uint8Array([255]))]],
  ["Отсутствует CSV", [file("assets.csv", assets)]],
  [
    "Неверные заголовки",
    [file("assets.csv", "id,broken"), file("rules.csv", rules)],
  ],
  [
    "Незакрытая кавычка",
    [
      file("assets.csv", assets.replace("PC-01", '"PC-01')),
      file("rules.csv", rules),
    ],
  ],
  [
    "Лишний столбец",
    [
      file("assets.csv", assets.replace("PC-01", "x,PC-01")),
      file("rules.csv", rules),
    ],
  ],
])
  await test(name, () => assert.rejects(() => importFiles(files)));
await test("Импорт CSV и JSON даёт одинаковые решения", async () => {
  const a = await importFiles([
    file("rules.csv", rules),
    file("assets.csv", assets),
  ]);
  const b = await importFiles([file("demo.json", demoText)]);
  assert.deepEqual(audit(a), audit(b));
});
await test("BOM, кавычки и запятая", () =>
  assert.equal(
    parseCSV(
      "\uFEFF" + assets.replace("Рабочая станция", '"Станция, ""А"""'),
      rules,
    ).assets[0].name,
    'Станция, "А"',
  ));
await test("Повторный импорт после ошибки", async () => {
  await assert.rejects(() => importFiles([file("bad.json", "null")]));
  assert.equal(
    (await importFiles([file("ok.json", demoText)])).assets.length,
    7,
  );
});
await test("Имя с разметкой остаётся строкой", () => {
  const c = model();
  c.assets[0].name = "<b>Учебный ПК</b>";
  assert.equal(validate(c).assets[0].name, c.assets[0].name);
});
await test("Неизвестная роль не получает исключение", () => {
  const c = model();
  c.assets[0].type = "constructor";
  assert.equal(audit(validate(c))[1].code, "P-02");
});
await test("ANY в назначении, протоколе и порте", () => {
  for (const key of ["destination", "protocol", "port"]) {
    const c = model();
    c.access_rules[1][key] = "ANY";
    assert.equal(audit(validate(c))[1].code, "P-08");
  }
});
await test("Пустой список правил", () => {
  const c = model();
  c.access_rules = [];
  assert.deepEqual(audit(validate(c)), []);
});
const correct = records.filter((r) => r.ok).length;
const summary =
  correct + "/20 (" + correct * 5 + "%). FP = " + fp + ", FN = " + fn + ".";
const separate = extra.filter((r) => r.ok).length + "/" + extra.length;
const describe = (rows) =>
  rows.map((r) => r.join(" / ")).join("<br>") || "Нет разрешений";
if (process.argv.includes("--report")) {
  writeFileSync(
    "docs/test_results.md",
    [
      "# Фактические результаты",
      "",
      "Среда Node.js " + process.version + ". Команда npm test.",
      "",
      summary,
      "",
      "Совпадение учитывает полный список ID, пунктов политики и статусов. FP и FN считаются по наличию хотя бы одного нарушения в конфигурации.",
      "",
      "| Файл | Сценарий | Эталон | Получено | Совпало |",
      "|---|---|---|---|---|",
      ...records.map((r) =>
        [
          r.file,
          r.name,
          describe(r.reference),
          describe(r.actual),
          r.ok ? "Да" : "Нет",
        ].join(" | "),
      ),
      "",
      "## Дополнительные проверки",
      "",
      separate,
      "",
      ...extra.map((r) => "- " + r.name + " — " + (r.ok ? "пройдено" : r.error)),
      "",
    ].join("\n"),
  );
}
console.log(summary, "Дополнительные проверки:", separate);
if (correct !== 20 || extra.some((r) => !r.ok)) process.exitCode = 1;
