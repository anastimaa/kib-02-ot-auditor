import type { Asset, Config, Rule } from "./input.ts";
export const version = "KIB-02/1.0";
export type Status = "PASS" | "VIOLATION" | "REVIEW";
type Clause = {
  status: Status;
  severity: string;
  reason: string;
  recommendation: string;
};
function clause(
  status: Status,
  severity: string,
  reason: string,
  recommendation: string,
): Clause {
  return { status, severity, reason, recommendation };
}
export const policy = {
  "C-01": clause(
    "REVIEW",
    "Проверка",
    "Совпали разрешение и запрет для одних условий.",
    "Уточните действующее правило и устраните противоречие.",
  ),
  "P-06": clause(
    "VIOLATION",
    "Критический",
    "Любой источник может обращаться к PLC.",
    "Ограничьте источник согласованным устройством.",
  ),
  "P-01": clause(
    "VIOLATION",
    "Критический",
    "Прямое разрешение из IT к промышленному контроллеру.",
    "Уберите прямое разрешение. Согласуйте доступ через сервер в DMZ.",
  ),
  "P-08": clause(
    "VIOLATION",
    "Средний",
    "Правило охватывает несколько портов, протоколов или устройств.",
    "Укажите конкретные устройства, протокол и один согласованный порт.",
  ),
  "P-03": clause(
    "PASS",
    "—",
    "Офисная станция обращается к согласованному серверу доступа по TCP/443.",
    "Сохраните ограничение сервиса.",
  ),
  "P-04": clause(
    "PASS",
    "—",
    "Соединение из DMZ точно совпадает с согласованным исключением.",
    "Сохраните заданное направление и сервис.",
  ),
  "P-05": clause(
    "PASS",
    "—",
    "Доступ к PLC внутри OT совпадает с технологическим разрешением.",
    "Сохраните ограничение источника и сервиса.",
  ),
  "P-02": clause(
    "VIOLATION",
    "Высокий",
    "Межсегментное разрешение отсутствует в перечне исключений.",
    "Уберите разрешение или согласуйте отдельный сервис с владельцем сегмента.",
  ),
  "P-07": clause(
    "REVIEW",
    "Проверка",
    "Внутрисегментное разрешение не описано учебной политикой.",
    "Уточните назначение сервиса у владельца устройства.",
  ),
};
const roles: Record<string, [string, string]> = {
  "PC-01": ["IT", "workstation"],
  "JUMP-01": ["DMZ", "jump_server"],
  "PLC-01": ["OT", "plc"],
  "HMI-01": ["OT", "hmi"],
  "ENG-01": ["OT", "engineering_station"],
  "HIST-01": ["OT", "historian"],
};
export const exceptions: [string, string, number, keyof typeof policy][] = [
  ["PC-01", "JUMP-01", 443, "P-03"],
  ["JUMP-01", "ENG-01", 3389, "P-04"],
  ["JUMP-01", "HIST-01", 443, "P-04"],
  ["HMI-01", "PLC-01", 502, "P-05"],
  ["ENG-01", "PLC-01", 502, "P-05"],
];
const signature = (r: Rule) =>
  JSON.stringify([r.source, r.destination, r.protocol, r.port]);
function matchesRole(a: Asset | undefined, id: string) {
  return a?.id === id && a.zone === roles[id][0] && a.type === roles[id][1];
}
function classify(
  r: Rule,
  s: Asset | undefined,
  d: Asset | undefined,
  denied: Set<string>,
): keyof typeof policy {
  if (denied.has(signature(r))) return "C-01";
  if (r.source === "ANY" && d?.type === "plc") return "P-06";
  if (s?.zone === "IT" && d?.type === "plc") return "P-01";
  if (!s || !d || r.protocol === "ANY" || typeof r.port === "string")
    return "P-08";
  const match = exceptions.find(
    ([from, to, port]) =>
      matchesRole(s, from) &&
      matchesRole(d, to) &&
      r.protocol === "TCP" &&
      r.port === port,
  );
  return match?.[3] ?? (s.zone !== d.zone ? "P-02" : "P-07");
}
export function audit(c: Config) {
  const assets = new Map(c.assets.map((a) => [a.id, a]));
  const denied = new Set(
    c.access_rules.filter((r) => r.action === "deny").map(signature),
  );
  return c.access_rules
    .filter((r) => r.action === "allow")
    .map((r) => {
      const s = assets.get(r.source),
        d = assets.get(r.destination),
        code = classify(r, s, d, denied);
      return {
        ...r,
        source_zone: s?.zone ?? "ANY",
        destination_zone: d?.zone ?? "ANY",
        code,
        ...policy[code],
      };
    });
}
export type Finding = ReturnType<typeof audit>[number];
