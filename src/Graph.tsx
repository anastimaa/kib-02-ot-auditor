import {
  Monitor,
  Server,
  Cpu,
  Database,
  Network,
  PanelTop,
  Waypoints,
} from "lucide-react";
import type { Config, Asset } from "./input";
import type { Finding } from "./policy";
export const colors = {
  VIOLATION: "#ff757d",
  PASS: "#54cda7",
  REVIEW: "#e9b961",
};
const zoneColor = {
  IT: "#80a9ff",
  DMZ: "#b298ff",
  OT: "#5cd1b1",
  ANY: "#e9b961",
};
const icons = new Map(
  Object.entries({
    workstation: Monitor,
    jump_server: Server,
    plc: Cpu,
    historian: Database,
    hmi: PanelTop,
    engineering_station: Monitor,
    server: Server,
    any: Waypoints,
  }),
);
export function Graph({
  config,
  rows,
  select,
  selected,
}: {
  config: Config;
  rows: Finding[];
  select: (r: Finding) => void;
  selected: string;
}) {
  const all: Asset[] = [...config.assets];
  const wildcard = rows.some(
    (r) => r.source === "ANY" || r.destination === "ANY",
  );
  const groups: string[] = ["IT", "DMZ", "OT"].filter((z) =>
    config.zones.some((v) => v.id === z),
  );
  if (wildcard) {
    groups.push("ANY");
    all.push({
      id: "ANY",
      name: "Любое устройство",
      type: "any",
      zone: "ANY" as Asset["zone"],
    });
  }
  const width = groups.length * 215,
    height = Math.max(
      222,
      ...groups.map((z) => all.filter((a) => a.zone === z).length * 48 + 57),
    );
  const points = new Map<string, { x: number; y: number }>();
  groups.forEach((z, i) => {
    const nodes = all.filter((a) => a.zone === z);
    nodes.forEach((a, j) =>
      points.set(a.id, {
        x: i * 215 + 108,
        y: 50 + ((j + 0.5) * (height - 60)) / nodes.length,
      }),
    );
  });
  return (
    <div className="canvas">
      <svg
        role="img"
        aria-label="Схема заданных соединений по зонам"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          minWidth: groups.length * 155,
          height: height > 300 ? height : undefined,
        }}
      >
        <defs>
          {Object.entries(colors).map(([key, c]) => (
            <marker
              key={key}
              id={"tip" + key}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8" fill={c} />
            </marker>
          ))}
        </defs>
        {groups.map((z, i) => (
          <g key={z}>
            <rect
              x={i * 215 + 5}
              y="5"
              width="204"
              height={height - 10}
              rx="9"
              stroke={zoneColor[z as keyof typeof zoneColor]}
              strokeOpacity=".32"
              strokeDasharray="4 5"
              fill={zoneColor[z as keyof typeof zoneColor]}
              fillOpacity=".035"
            />
            <text
              x={i * 215 + 18}
              y="29"
              fill={zoneColor[z as keyof typeof zoneColor]}
              className="zoneText"
            >
              {z}{" "}
              <tspan fill="#99a3b6" fontSize="11">
                {
                  {
                    IT: " / Офис",
                    DMZ: " / Периметр",
                    OT: " / Производство",
                    ANY: " / Все",
                  }[z]
                }
              </tspan>
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const s = points.get(r.source)!,
            d = points.get(r.destination)!,
            dir = d.x >= s.x ? 1 : -1;
          let path: string;
          if (s.x === d.x) {
            const bend = s.x + 104 - (i % 4) * 4;
            path =
              s.y === d.y
                ? `M ${s.x + 47} ${s.y - 8} C ${bend} ${s.y - 40}, ${bend} ${s.y + 35}, ${s.x + 47} ${s.y + 8}`
                : `M ${s.x + 49} ${s.y} C ${bend} ${s.y}, ${bend} ${d.y}, ${d.x + 50} ${d.y}`;
          } else {
            const x = s.x + dir * 49,
              ex = d.x - dir * 50,
              y = s.y + ((i % 3) - 1) * 4,
              ey = d.y + ((i % 3) - 1) * 4;
            path =
              Math.abs(d.x - s.x) > 220
                ? `M ${x} ${y} C ${x + dir * 65} ${y}, ${x + dir * 32} 44, ${x + dir * 90} 44 L ${ex - dir * 45} 44 Q ${ex - dir * 18} 44 ${ex} ${ey}`
                : `M ${x} ${y} C ${(x + ex) / 2} ${y}, ${(x + ex) / 2} ${ey}, ${ex} ${ey}`;
          }
          return (
            <g key={r.id} onClick={() => select(r)} className="edge">
              <title>{r.id + " · " + r.source + " → " + r.destination}</title>
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="10"
              />
              <path
                d={path}
                fill="none"
                stroke={colors[r.status]}
                strokeWidth={selected === r.id ? 3.2 : 1.5}
                strokeDasharray={r.status === "PASS" ? undefined : "5 3"}
                markerEnd={"url(#tip" + r.status + ")"}
              />
            </g>
          );
        })}
        {all.map((a) => {
          const p = points.get(a.id)!,
            Icon = icons.get(a.type) ?? Network;
          return (
            <g key={a.id} transform={`translate(${p.x - 49},${p.y - 16})`}>
              <title>{a.name + " · " + a.type}</title>
              <rect
                width="98"
                height="32"
                rx="6"
                fill="#1b222e"
                stroke="#384251"
              />
              <Icon
                x="8"
                y="8"
                width="16"
                height="16"
                color={zoneColor[a.zone]}
              />
              <text
                x="31"
                y="21"
                fontSize="12"
                fontFamily="monospace"
                fill="#e7eaf3"
              >
                {a.id.length > 9 ? a.id.slice(0, 8) + "…" : a.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
