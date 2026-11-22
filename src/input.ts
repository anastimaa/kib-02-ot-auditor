export type Zone = "IT" | "DMZ" | "OT";
export interface Asset {
  id: string;
  name: string;
  zone: Zone;
  type: string;
}
export interface Rule {
  id: string;
  source: string;
  destination: string;
  protocol: string;
  port: number | string;
  action: string;
}
export interface Config {
  schema_version: string;
  network_name: string;
  zones: { id: Zone; name: string }[];
  assets: Asset[];
  access_rules: Rule[];
}
const zones = ["IT", "DMZ", "OT"];
export const LIMIT = 1048576;
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
function record(
  value: unknown,
  keys: string,
  at: string,
): Record<string, unknown> {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    at + " — ожидается объект.",
  );
  const obj = value as Record<string, unknown>,
    allowed = keys.split(" ");
  for (const key of allowed)
    check(Object.hasOwn(obj, key), at + " — отсутствует поле " + key);
  for (const key of Object.keys(obj))
    check(
      allowed.includes(key),
      at + " — неизвестное поле " + key.slice(0, 50),
    );
  return obj;
}
function string(v: unknown, at: string) {
  check(
    typeof v === "string" &&
      v.length <= 120 &&
      v.trim() &&
      !/[\x00-\x1f\x7f]/.test(v),
    at + " — нужна строка длиной 1–120 без управляющих символов.",
  );
  return v.trim();
}
function id(v: unknown, at: string) {
  const name = string(v, at);
  check(
    /^[a-zA-Z0-9._-]{1,40}$/.test(name) && name !== "ANY",
    at + " — недопустимый ID.",
  );
  return name;
}
function list(v: unknown, min: number, max: number, key: string): unknown[] {
  check(
    Array.isArray(v) && v.length >= min && v.length <= max,
    key + " — допустимое число записей от " + min + " до " + max + ".",
  );
  return v;
}
function unique(items: { id: string }[], at: string) {
  const keys = new Set<string>();
  for (const x of items) {
    check(!keys.has(x.id), at + " — повтор ID " + x.id);
    keys.add(x.id);
  }
  return keys;
}
function port(v: unknown, at: string) {
  if (v === "ANY") return v;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 65535)
    return v;
  if (typeof v === "string" && /^\d{1,5}-\d{1,5}$/.test(v)) {
    const [lo, hi] = v.split("-").map(Number);
    if (lo < hi && hi <= 65535) return lo + "-" + hi;
  }
  throw Error(at + " — нужен порт 0–65535, диапазон a-b или ANY.");
}
export function validate(raw: unknown): Config {
  const obj = record(
    raw,
    "schema_version network_name zones assets access_rules",
    "Конфигурация",
  );
  check(obj.schema_version === "1.0", "Поддерживается schema_version «1.0».");
  const network_name = string(obj.network_name, "network_name");
  const groups = list(obj.zones, 1, 3, "zones").map((v, i) => {
    const at = "zones[" + i + "]",
      z = record(v, "id name", at);
    check(zones.includes(z.id as string), at + " — укажите IT, DMZ или OT.");
    return { id: z.id as Zone, name: string(z.name, at + ".name") };
  });
  const groupIds = unique(groups, "zones");
  const assets = list(obj.assets, 1, 200, "assets").map((v, i) => {
    const a = record(v, "id name zone type", "assets[" + i + "]"),
      key = id(a.id, "ID устройства");
    check(
      groupIds.has(a.zone as string),
      key +
        " — отсутствующая зона " +
        (typeof a.zone === "string"
          ? a.zone.slice(0, 40)
          : "(ожидается строка)"),
    );
    return {
      id: key,
      name: string(a.name, key + ".name"),
      zone: a.zone as Zone,
      type: string(a.type, key + ".type"),
    };
  });
  const keys = unique(assets, "assets");
  const rules = list(obj.access_rules, 0, 1000, "access_rules").map((v, i) => {
    const r = record(
        v,
        "id source destination protocol port action",
        "access_rules[" + i + "]",
      ),
      key = id(r.id, "ID правила");
    function endpoint(v: unknown, field: string) {
      const s = string(v, key + "." + field);
      check(
        s === "ANY" || keys.has(s),
        key + " — неизвестное устройство " + s + " (" + field + ").",
      );
      return s;
    }
    check(
      ["TCP", "UDP", "ANY"].includes(r.protocol as string),
      key + " — допустимы TCP, UDP и ANY.",
    );
    check(
      ["allow", "deny"].includes(r.action as string),
      key + " — допустимы allow и deny.",
    );
    return {
      id: key,
      source: endpoint(r.source, "source"),
      destination: endpoint(r.destination, "destination"),
      protocol: r.protocol as string,
      port: port(r.port, key),
      action: r.action as string,
    };
  });
  unique(rules, "access_rules");
  return {
    schema_version: "1.0",
    network_name,
    zones: groups,
    assets,
    access_rules: rules,
  };
}
export function parseJSON(text: string) {
  check(text.trim(), "Файл пуст.");
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("Ошибка синтаксиса JSON. Проверьте кавычки, запятые и скобки.");
  }
  return validate(raw);
}
function csv(text: string, header: string[], max: number) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
  check(lines.length <= max + 1, "CSV — превышен лимит строк " + max);
  check(
    lines.shift() === header.join(","),
    "CSV — ожидается заголовок " + header.join(","),
  );
  return lines.map((line, i) => {
    const fields: string[] = [];
    // sticky выражение разбирает одно поле целиком, включая удвоенные кавычки.
    const token = /(?:,|^)(?:"((?:[^"]|"")*)"|([^",]*))(?=,|$)/y;
    const row = "," + line;
    let pos = 0;
    do {
      token.lastIndex = pos;
      // Добавление запятой в начале унифицирует первое и следующие поля.
      const match = token.exec(row);
      check(
        match && token.lastIndex > pos,
        "CSV, строка " + (i + 2) + " — проверьте кавычки.",
      );
      fields.push((match[1]?.replace(/""/g, '"') ?? match[2]).trim());
      pos = token.lastIndex;
      check(
        fields.length <= header.length,
        "CSV, строка " + (i + 2) + " — лишние столбцы.",
      );
    } while (pos < line.length + 1);
    check(
      fields.length === header.length,
      "CSV, строка " + (i + 2) + " — неверное число столбцов.",
    );
    return Object.fromEntries(header.map((key, j) => [key, fields[j]]));
  });
}
export function parseCSV(assetsText: string, rulesText: string) {
  const assets = csv(assetsText, ["id", "name", "zone", "type"], 200);
  const rules = csv(
    rulesText,
    ["id", "source", "destination", "protocol", "port", "action"],
    1000,
  );
  return validate({
    schema_version: "1.0",
    network_name: "Конфигурация CSV",
    zones: [...new Set(assets.map((a) => a.zone))].map((id) => ({
      id,
      name: id,
    })),
    assets,
    access_rules: rules.map((r) => ({
      ...r,
      port: /^\d{1,5}$/.test(r.port) ? Number(r.port) : r.port,
    })),
  });
}
export async function importFiles(files: File[]) {
  for (const f of files)
    check(
      f.size > 0 && f.size <= LIMIT,
      "Файл " + f.name + " пуст или превышает 1 МиБ.",
    );
  async function read(f: File) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        await f.arrayBuffer(),
      );
    } catch {
      throw Error("Не удалось прочитать " + f.name + ". Используйте UTF-8.");
    }
  }
  if (files.length === 1 && /\.json$/i.test(files[0].name))
    return parseJSON(await read(files[0]));
  const assets = files.find((f) => f.name.toLowerCase() === "assets.csv"),
    rules = files.find((f) => f.name.toLowerCase() === "rules.csv");
  check(
    files.length === 2 && assets && rules,
    "Выберите один JSON или одновременно assets.csv и rules.csv.",
  );
  return parseCSV(await read(assets), await read(rules));
}
