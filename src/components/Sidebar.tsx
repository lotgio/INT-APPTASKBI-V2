import Icon from "./Icon";

export type Route =
  | "calendario"
  | "avanzamento"
  | "todo"
  | "statistiche"
  | "team"
  | "database"
  | "calendario-classico";

type Item = { route: Route; label: string; icon: string };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Pianificazione",
    items: [
      { route: "calendario", label: "Calendario", icon: "calendar" },
      { route: "avanzamento", label: "Avanzamento", icon: "progress" },
      { route: "todo", label: "Todo", icon: "list" }
    ]
  },
  {
    title: "Analisi",
    items: [
      { route: "statistiche", label: "Statistiche", icon: "pie" },
      { route: "team", label: "Team", icon: "users" },
      { route: "database", label: "Database task", icon: "database" }
    ]
  },
  {
    title: "Altro",
    items: [{ route: "calendario-classico", label: "Calendario classico", icon: "history" }]
  }
];

export default function Sidebar({ route }: { route: Route }) {
  return (
    <nav className="ui-side" aria-label="Navigazione principale">
      <div className="ui-brand">
        <div className="ui-brand-mark">BI</div>
        <div>
          <span className="ui-brand-name">AppTask BI</span>
          <span className="ui-brand-sub">Reparto operativo</span>
        </div>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title} style={{ display: "contents" }}>
          <span className="ui-side-section">{section.title}</span>
          {section.items.map((item) => {
            const active = item.route === route;
            return (
              <a
                key={item.route}
                href={`#/${item.route}`}
                className={`ui-nav-item${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
                {active && <span className="ui-nav-dot" />}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
