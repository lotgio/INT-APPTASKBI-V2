const PATHS: Record<string, JSX.Element> = {
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  progress: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  check: (<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></>),
  list: <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  trend: (<><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>),
  pie: (<><path d="M12 3v9l7 4" /><circle cx="12" cy="12" r="9" /></>),
  users: <path d="M9 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.4 3.5 5.2" />,
  database: (<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>),
  history: <path d="M3 12a9 9 0 103-6.7M3 4v5h5M12 7v5l3 2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  leave: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M9 15h6" /></>),
  alert: (<><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17.5h.01" /></>),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>)
};

export default function Icon({ name, size = 16, strokeWidth = 1.8 }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {PATHS[name] ?? null}
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#A89E95" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
      {[6, 12, 18].map((y) => (<g key={y}><circle cx="9" cy={y} r="1.6" /><circle cx="15" cy={y} r="1.6" /></g>))}
    </svg>
  );
}
