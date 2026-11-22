import { useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileJson,
  FileText,
  Filter,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { importFiles, validate } from "./input";
import {
  audit,
  exceptions,
  policy,
  version,
  type Finding,
  type Status,
} from "./policy";
import { Graph } from "./Graph";
import demo from "../examples/plant.json";
import clean from "../examples/approved.json";
import specification from "../docs/specification.md?raw";
import "./style.css";
const labels = {
  PASS: "Допустимо",
  VIOLATION: "Нарушение",
  REVIEW: "На проверку",
};
const names = ["Обзор аудита", "Устройства", "Политика"];
function Badge({ s }: { s: Status }) {
  return (
    <span className={"badge " + s}>
      <i />
      {labels[s]}
    </span>
  );
}
function Section({
  icon,
  title,
  extra,
}: {
  icon: ReactNode;
  title: string;
  extra?: ReactNode;
}) {
  return (
    <div className="section">
      <h2>
        {icon}
        {title}
      </h2>
      {extra}
    </div>
  );
}
function App() {
  const [config, setConfig] = useState(() => validate(demo)),
    [file, setFile] = useState("plant.json"),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState("ALL"),
    [query, setQuery] = useState(""),
    [chosen, choose] = useState(""),
    [issues, onlyIssues] = useState(false),
    [error, setError] = useState(""),
    [log, setLog] = useState(["Демопример проверен. Аудит завершён."]),
    [modal, open] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const rows = useMemo(() => audit(config), [config]),
    selected = rows.find((r) => r.id === chosen);
  const counts = { PASS: 0, VIOLATION: 0, REVIEW: 0 };
  rows.forEach((r) => counts[r.status]++);
  const visible = rows.filter(
    (r) =>
      (filter === "ALL" || r.status === filter) &&
      [r.id, r.source, r.destination, r.code].some((s) =>
        s.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  function record(s: string) {
    setLog((prev) => [...prev.slice(-49), s]);
  }
  function reset(c: typeof config, name: string) {
    setConfig(c);
    setFile(name);
    choose("");
    setQuery("");
    setFilter("ALL");
    onlyIssues(false);
    setError("");
    setPage(0);
    record(
      "Валидация пройдена. Проверено разрешений: " +
        c.access_rules.filter((r) => r.action === "allow").length,
    );
  }
  function show(m: string) {
    open(m);
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    open("");
  }
  async function upload(files: File[]) {
    setBusy(true);
    setError("");
    record("Начат импорт.");
    try {
      const c = await importFiles(files);
      reset(c, files.map((f) => f.name).join(" + "));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать файлы.");
      record("Импорт отклонён.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function exportReport() {
    const data = {
      config_name: config.network_name,
      source_file: file,
      policy_version: version,
      scope: "Явные разрешения; маршрутизация не моделируется.",
      summary: {
        zones: config.zones.length,
        assets: config.assets.length,
        total: config.access_rules.length,
        checked: rows.length,
        deny: config.access_rules.length - rows.length,
        ...counts,
      },
      results: rows,
      excluded_denies: config.access_rules.filter((r) => r.action === "deny"),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kib-02-audit.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    record("Отчёт подготовлен к скачиванию.");
  }
  function detail(r: Finding) {
    choose(r.id);
    show("detail");
  }
  return (
    <>
      <header>
        <div className="brand">
          <span className="logo">
            <Layers3 size={24} />
          </span>
          <b>
            KIB<span>-02</span>
          </b>
        </div>
        <span className="divider" />
        <nav>
          {names.map((name, i) => {
            const Icon = [LayoutDashboard, Network, BookOpen][i];
            return (
              <button
                key={name}
                className={page === i ? "active" : ""}
                onClick={() => setPage(i)}
              >
                <Icon size={16} />
                {name}
              </button>
            );
          })}
        </nav>
        <span className="local">
          <i />
          Локальный режим
        </span>
      </header>
      <main>
        <div className="breadcrumb">
          Рабочая область <ChevronRight size={13} /> <span>{names[page]}</span>
        </div>
        <div className="pagehead">
          <div>
            <h1>{names[page]}</h1>
            <p>
              {
                [
                  "Аудитор сегментации IT/OT-сетей",
                  "Состав устройств загруженной конфигурации",
                  "Правила оценки явно разрешённых соединений",
                ][page]
              }
            </p>
          </div>
          <div className="actions">
            <button onClick={exportReport}>
              <ArrowDownToLine />
              Экспорт отчёта
            </button>
            <button
              className="primary"
              onClick={() => {
                setError("");
                show("import");
              }}
            >
              <Upload />
              Загрузить конфигурацию
            </button>
          </div>
        </div>
        {page === 0 ? (
          <>
            <div className="metrics">
              {[
                [ListChecks, "Проверено правил", rows.length, "total"],
                [AlertTriangle, "Нарушения", counts.VIOLATION, "VIOLATION"],
                [CheckCircle2, "Допустимые", counts.PASS, "PASS"],
                [CircleHelp, "Требуют проверки", counts.REVIEW, "REVIEW"],
              ].map(([I, label, n, cls]) => {
                const Icon = I as typeof ListChecks;
                return (
                  <button
                    key={String(label)}
                    className={"metric " + cls}
                    onClick={() =>
                      setFilter(cls === "total" ? "ALL" : String(cls))
                    }
                  >
                    <span className="metricText">{String(label)}</span>
                    <b>{String(n).padStart(2, "0")}</b>
                    <span className="metricIcon">
                      <Icon size={20} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="split">
              <section className="panel">
                <Section
                  icon={<Network />}
                  title="Схема соединений"
                  extra={
                    <button
                      className={"small " + (issues ? "on" : "")}
                      aria-pressed={issues}
                      onClick={() => onlyIssues(!issues)}
                    >
                      <Filter size={13} />
                      Нарушения
                    </button>
                  }
                />
                <Graph
                  config={config}
                  rows={
                    issues ? rows.filter((r) => r.status === "VIOLATION") : rows
                  }
                  select={detail}
                  selected={chosen}
                />
                <div className="legend">
                  {(["PASS", "VIOLATION", "REVIEW"] as Status[]).map((s) => (
                    <span key={s}>
                      <i className={s} />
                      {labels[s]}
                    </span>
                  ))}
                </div>
              </section>
              <section className="panel config">
                <Section icon={<SlidersHorizontal />} title="Конфигурация" />
                <div className="filename">
                  <span className="fileicon">
                    <FileJson />
                  </span>
                  <div>
                    <strong>{config.network_name}</strong>
                    <code>{file}</code>
                  </div>
                </div>
                <dl>
                  <dt>Сегменты</dt>
                  <dd>{config.zones.length}</dd>
                  <dt>Устройства</dt>
                  <dd>{config.assets.length}</dd>
                  <dt>Правила доступа</dt>
                  <dd>{config.access_rules.length}</dd>
                  <dt>Политика</dt>
                  <dd className="violet">{version}</dd>
                </dl>
                <button className="example" onClick={() => show("examples")}>
                  <Layers3 size={15} />
                  Выбрать демопример
                  <ChevronDown size={14} />
                </button>
              </section>
            </div>
            <section className="panel results">
              <Section
                icon={<ListChecks />}
                title="Результаты проверки"
                extra={<span className="meta">{rows.length} разрешений</span>}
              />
              {counts.VIOLATION === 0 && (
                <p className="notice">
                  Нарушений не найдено. Требуют проверки: {counts.REVIEW}.
                </p>
              )}
              <div className="tools">
                <div className="tabs">
                  {[
                    ["ALL", "Все"],
                    ["VIOLATION", "Нарушения"],
                    ["PASS", "Допустимые"],
                    ["REVIEW", "На проверку"],
                  ].map(([key, title]) => (
                    <button
                      className={filter === key ? "sel" : ""}
                      onClick={() => setFilter(key)}
                      key={key}
                    >
                      {title}{" "}
                      <small>
                        {key === "ALL" ? rows.length : counts[key as Status]}
                      </small>
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="Поиск правил"
                    placeholder="Поиск по ID…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Правило",
                        "Источник",
                        "Назначение",
                        "Сервис",
                        "Статус",
                        "",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr
                        key={r.id}
                        className={chosen === r.id ? "chosen" : ""}
                        onClick={() => detail(r)}
                      >
                        <td>
                          <code className="rule">{r.id}</code>
                        </td>
                        <td>
                          {r.source} <small>{r.source_zone}</small>
                        </td>
                        <td>
                          {r.destination} <small>{r.destination_zone}</small>
                        </td>
                        <td>
                          <code>
                            {r.protocol}/{r.port}
                          </code>
                        </td>
                        <td>
                          <Badge s={r.status} />
                        </td>
                        <td>
                          <button
                            className="rowbtn"
                            aria-label={"Подробнее о " + r.id}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length && (
                <p className="empty">Подходящих разрешений нет.</p>
              )}
            </section>
          </>
        ) : page === 1 ? (
          <section className="panel">
            <Section icon={<Network />} title={config.network_name} />
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {["ID", "Название", "Зона", "Тип"].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config.assets.map((a) => (
                    <tr key={a.id}>
                      {[a.id, a.name, a.zone, a.type].map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Запреты конфигурации</h3>
            {config.access_rules
              .filter((r) => r.action === "deny")
              .map((r) => (
                <p key={r.id}>
                  {r.id} · {r.source} → {r.destination} · {r.protocol}/{r.port}
                </p>
              ))}
            {!config.access_rules.some((r) => r.action === "deny") && (
              <p>Правил deny нет.</p>
            )}
          </section>
        ) : (
          <section className="panel policy">
            <Section icon={<ShieldCheck />} title={"Политика " + version} />
            <p>
              Проверки идут сверху вниз до первого совпадения. Каждое разрешение
              получает один результат. Для исключения должны совпасть ID, зоны,
              типы устройств и сервис.
            </p>
            {Object.entries(policy).map(([id, v]) => (
              <div className="clause" key={id}>
                <code>{id}</code>
                <div>
                  <strong>{v.reason}</strong>
                  <p>{v.recommendation}</p>
                  {exceptions
                    .filter((e) => e[3] === id)
                    .map(([s, d, p]) => (
                      <code key={s + d}>
                        {s} → {d} · TCP/{p}
                        <br />
                      </code>
                    ))}
                </div>
                <Badge s={v.status} />
              </div>
            ))}
            <details>
              <summary>Полная спецификация форматов и политики</summary>
              <pre>{specification}</pre>
            </details>
          </section>
        )}
        <footer>
          <span>
            <LockKeyhole size={14} />
            Обработка в браузере
          </span>
          <button onClick={() => show("log")}>
            <Activity size={14} />
            Журнал сессии
          </button>
        </footer>
      </main>
      <dialog ref={dialog} onCancel={() => open("")}>
        <div className="dialoghead">
          <h2>
            {
              {
                import: "Загрузка конфигурации",
                examples: "Демонстрационные конфигурации",
                detail: "Подробности правила",
                log: "Журнал сессии",
              }[modal]
            }
          </h2>
          <button aria-label="Закрыть" onClick={close}>
            <X size={17} />
          </button>
        </div>
        {modal === "import" ? (
          <>
            <p>
              Выберите один JSON либо два файла вместе — assets.csv и rules.csv.
              До 1 МиБ каждый, кодировка UTF-8.
            </p>
            <label className="drop">
              <ArrowUpFromLine />
              <b>Выберите файлы конфигурации</b>
              <input
                ref={input}
                type="file"
                accept=".json,.csv"
                multiple
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.length)
                    void upload(Array.from(e.target.files));
                }}
              />
            </label>
            <p>
              Аудит запускается после проверки файлов. Анализируются только явно
              заданные разрешения. Маршрутизация не моделируется.
            </p>
            {busy && <p>Читаем файлы…</p>}
            {error && (
              <p className="err" role="alert">
                {error} Предыдущая конфигурация сохранена.
              </p>
            )}
          </>
        ) : modal === "examples" ? (
          <>
            {[
              [demo, "plant.json", "С нарушениями"],
              [clean, "approved.json", "Без нарушений"],
            ].map(([c, f, t]) => (
              <button
                key={String(f)}
                className="demobtn"
                onClick={() => {
                  reset(validate(c), String(f));
                  close();
                }}
              >
                <FileText />
                <div>
                  <b>{String(t)}</b>
                  <code>{String(f)}</code>
                </div>
                <ChevronRight />
              </button>
            ))}
          </>
        ) : modal === "detail" && selected ? (
          <>
            <div className="detailtop">
              <code>
                {selected.id} · {selected.code}
              </code>
              <Badge s={selected.status} />
            </div>
            <h3>
              {selected.source} → {selected.destination}
            </h3>
            <p>
              {selected.source_zone} → {selected.destination_zone} ·{" "}
              {selected.protocol}/{selected.port} · Приоритет:{" "}
              {selected.severity}
            </p>
            <h4>Основание</h4>
            <p>{selected.reason}</p>
            <h4>Рекомендация</h4>
            <p>{selected.recommendation}</p>
          </>
        ) : modal === "log" ? (
          <ol>
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : null}
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
