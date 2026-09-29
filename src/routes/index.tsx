import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Home,
  Info,
  Plane,
  Printer,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LineChart } from "@/components/apix/LineChart";
import { Button } from "@/components/ui/button";
import {
  complianceEvent,
  crawlDelay,
  isPathAllowed,
  robotsSummary,
  seedComplianceLog,
} from "@/lib/apix/compliance";
import { buildDataset, type Dataset } from "@/lib/apix/dataset";
import { CARRIERS, ROUTES } from "@/lib/apix/routes";
import { WINDOWS, type ComplianceEvent, type Frequency } from "@/lib/apix/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIRTRACE — Real-Time Domestic Airfare Price Intelligence" },
      {
        name: "description",
        content:
          "AIRTRACE collects, validates and analyses domestic airfare data across Indian air routes for statistical monitoring.",
      },
      { property: "og:title", content: "AIRTRACE — Domestic Airfare Price Intelligence" },
      {
        property: "og:description",
        content:
          "A traffic-weighted airfare index with live price monitoring, route analysis, lead-time intelligence and transparent methodology.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AirtraceApp,
});

type ViewKey =
  | "home"
  | "index"
  | "live"
  | "route"
  | "lead"
  | "explorer"
  | "reports"
  | "pipeline"
  | "sources"
  | "methodology"
  | "api"
  | "admin";

const NAV: { id: ViewKey; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <Home className="size-4" /> },
  { id: "index", label: "Airfare Index", icon: <Activity className="size-4" /> },
  { id: "live", label: "Live Prices", icon: <Plane className="size-4" /> },
  { id: "route", label: "Route Analysis", icon: <ChevronRight className="size-4" /> },
  { id: "lead", label: "Lead-Time Analysis", icon: <Clock3 className="size-4" /> },
  { id: "explorer", label: "Data Explorer", icon: <Search className="size-4" /> },
  { id: "reports", label: "Reports", icon: <FileText className="size-4" /> },
  { id: "pipeline", label: "Data Pipeline", icon: <Database className="size-4" /> },
  { id: "sources", label: "Sources & Compliance", icon: <ShieldCheck className="size-4" /> },
  { id: "methodology", label: "Methodology", icon: <BookOpen className="size-4" /> },
  { id: "api", label: "API Reference", icon: <ExternalLink className="size-4" /> },
  { id: "admin", label: "Admin Ops", icon: <UserRound className="size-4" /> },
];

const VIEW_TITLES: Record<ViewKey, string> = Object.fromEntries(NAV.map((item) => [item.id, item.label])) as Record<
  ViewKey,
  string
>;

const CITY_NAMES: Record<string, string> = {
  DEL: "Delhi",
  BOM: "Mumbai",
  BLR: "Bengaluru",
  CCU: "Kolkata",
  HYD: "Hyderabad",
  MAA: "Chennai",
  GOI: "Goa",
};

const inr = (value: number | null | undefined) =>
  value == null ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`;

function AirtraceApp() {
  const [view, setView] = useState<ViewKey>("index");
  const [routeId, setRouteId] = useState(ROUTES[0]?.id ?? "DEL-BOM");
  const handleSearch = (raw: string) => {
    const q = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/[–—/]/g, "-");
    if (!q) return false;
    const route = ROUTES.find((item) => item.id === q || item.id.replace("-", "") === q.replace("-", "") || item.id.includes(q));
    if (route) { setRouteId(route.id); setView("route"); return true; }
    const lower = raw.trim().toLowerCase();
    const match = (Object.entries(VIEW_TITLES) as [ViewKey, string][]).find(([key, title]) => title.toLowerCase().includes(lower) || key.includes(lower));
    if (match) { setView(match[0]); return true; }
    return false;
  };
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [salt, setSalt] = useState("replay");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<ComplianceEvent[]>(() => seedComplianceLog());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const data = useMemo(() => buildDataset(salt), [salt]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runLiveCycle = useCallback(() => {
    if (scraping) return;
    setScraping(true);
    setMode("live");
    setProgress(0);
    setView("live");

    const steps: { detail: string; source: string; kind: ComplianceEvent["kind"]; ok: boolean }[] = [];
    for (const source of robotsSummary()) {
      const path = source.id === "airline-direct" ? "/api/search" : "/flight/search";
      const allowed = isPathAllowed(source.id, path);
      steps.push({
        source: source.id,
        kind: "robots",
        detail: `robots.txt checked — ${path} ${allowed ? "permitted" : "blocked"}`,
        ok: allowed,
      });
      steps.push({
        source: source.id,
        kind: "ratelimit",
        detail: `rate limiter active at 1 request / ${source.crawlDelay.toFixed(1)}s`,
        ok: true,
      });
      steps.push({
        source: source.id,
        kind: "fetch",
        detail: `${ROUTES.length * WINDOWS.length} route-window probes completed`,
        ok: true,
      });
    }
    steps.push({ source: "ota-aggregator", kind: "backoff", detail: "one throttled probe retried after backoff", ok: false });
    steps.push({ source: "airline-direct", kind: "cache", detail: "collection cycle validated and published", ok: true });

    steps.forEach((step, index) => {
      const timer = setTimeout(() => {
        setLog((current) => [complianceEvent(step.source, step.kind, step.detail, step.ok), ...current].slice(0, 40));
        setProgress(Math.round(((index + 1) / steps.length) * 100));
        if (index === steps.length - 1) {
          setSalt(`live-${Date.now()}`);
          setScraping(false);
        }
      }, 300 * (index + 1));
      timers.current.push(timer);
    });
  }, [scraping]);

  const latestDaily = data.series.daily.at(-1);
  const previousDaily = data.series.daily.at(-2) ?? latestDaily;
  const change = latestDaily && previousDaily ? latestDaily.fisher - previousDaily.fisher : 0;

  return (
    <div className="min-h-screen bg-background text-foreground lg:pl-60">
      <Sidebar active={view} onNavigate={setView} />
      <TopBar
        active={view}
        onSearch={handleSearch}
        onNavigate={setView}
        mode={mode}
        scraping={scraping}
        progress={progress}
        indexValue={latestDaily?.fisher ?? 100}
        change={change}
      />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-7">
        <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Home className="size-4" aria-hidden="true" />
          <span>Home</span>
          <ChevronRight className="size-4" aria-hidden="true" />
          <span className="font-medium text-primary">{VIEW_TITLES[view]}</span>
        </div>

        {view === "home" && <HomeView data={data} onNavigate={setView} />}
        {view === "index" && <IndexView data={data} frequency={frequency} setFrequency={setFrequency} onNavigate={setView} />}
        {view === "live" && (
          <LiveView data={data} scraping={scraping} progress={progress} mode={mode} runLiveCycle={runLiveCycle} />
        )}
        {view === "route" && <RouteView data={data} routeId={routeId} setRouteId={setRouteId} />}
        {view === "lead" && <LeadTimeView data={data} onNavigate={setView} />}
        {view === "explorer" && <ExplorerView data={data} />}
        {view === "reports" && <ReportsView data={data} />}
        {view === "pipeline" && <PipelineView data={data} log={log} />}
        {view === "sources" && <SourcesView data={data} log={log} />}
        {view === "methodology" && <MethodologyView />}
        {view === "api" && <ApiView />}
        {view === "admin" && <AdminView data={data} runLiveCycle={runLiveCycle} scraping={scraping} />}
      </main>

      <footer className="mt-8 border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-7 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>AIRTRACE · Domestic Airfare Statistical Intelligence</span>
          <span className="num">Illustrative demonstration data · Last observation {data.lastObserved}</span>
        </div>
      </footer>
    </div>
  );
}

function Sidebar({ active, onNavigate }: { active: ViewKey; onNavigate: (view: ViewKey) => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-brand-strong text-primary-foreground lg:flex">
      <button
        onClick={() => onNavigate("home")}
        className="flex items-center gap-3 border-b border-primary-foreground/10 px-5 py-5 text-left"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary font-display text-[10px] font-bold leading-3 text-primary-foreground">
          AIR<br />TRACE
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-none tracking-tight">AIRTRACE</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-primary-foreground/60">Airfare Intelligence</p>
        </div>
      </button>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-primary-foreground/70 transition-colors hover:bg-brand-hover hover:text-primary-foreground",
              active === item.id && "bg-primary font-semibold text-primary-foreground shadow-sm",
            )}
          >
            {item.icon}
            {item.label}
            {active === item.id && <span className="ml-auto size-1.5 rounded-full bg-highlight" />}
          </button>
        ))}
      </nav>
      <div className="border-t border-primary-foreground/10 px-5 py-4">
        <p className="num text-[11px] text-primary-foreground/60">Base: FY 2024–25 = 100</p>
        <p className="mt-1 text-[11px] text-primary-foreground/40">Illustrative demonstration data</p>
      </div>
    </aside>
  );
}

function TopBar({
  active,
  onSearch,
  onNavigate,
  mode,
  scraping,
  progress,
  indexValue,
  change,
}: {
  active: ViewKey;
  onSearch: (q: string) => boolean;
  onNavigate: (view: ViewKey) => void;
  mode: "replay" | "live";
  scraping: boolean;
  progress: number;
  indexValue: number;
  change: number;
}) {
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-7">
        <button onClick={() => onNavigate("home")} className="flex items-center gap-2 lg:hidden">
          <div className="grid size-8 place-items-center rounded-md bg-primary font-display text-[8px] font-bold leading-2 text-primary-foreground">
            AIR<br />TRACE
          </div>
          <span className="font-display text-base font-bold text-primary">AIRTRACE</span>
        </button>
        <div className="flex items-center gap-2 rounded-full border border-info-border bg-info-soft px-3 py-1.5 text-xs">
          <span className={cn("size-2 rounded-full", scraping ? "animate-pulse bg-warning" : "bg-success")} aria-hidden="true" />
          <span className="num font-semibold text-primary">{indexValue.toFixed(2)}</span>
          <span className={cn("num font-semibold", change >= 0 ? "text-success" : "text-destructive")}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}
          </span>
          <span className="hidden text-muted-foreground sm:inline">
            · {mode === "live" ? "Live" : "Replay"} · {ROUTES.length} corridors{scraping ? ` · ${progress}%` : ""}
          </span>
        </div>
        <label className="relative ml-auto hidden md:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            aria-label="Search routes and reports"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setNotFound(false); }}
            onKeyDown={(event) => { if (event.key === "Enter") { if (onSearch(query)) setQuery(""); else setNotFound(true); } }}
            placeholder="Search routes (e.g. DEL-BOM), reports..."
            className={`h-9 w-64 rounded-full border bg-background pl-9 pr-3 text-xs outline-none ${notFound ? "border-destructive" : "border-input"} focus:border-primary focus:ring-1 focus:ring-ring`}
          />
        </label>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => onNavigate("admin")}>
          <UserRound className="size-4" /> Admin / Data Ops
        </Button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden" aria-label="Primary navigation">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground",
              active === item.id && "bg-primary text-primary-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function PageIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="mb-5 flex flex-col gap-4 border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="font-display text-xl font-bold text-primary">{title}</h1>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}

function Section({ title, subtitle, icon, children, className }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-5 border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-4 flex flex-col gap-1 border-b border-border bg-secondary/60 px-3 py-3 md:flex-row md:items-center md:justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase text-primary">
          {icon}{title}
        </h2>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "up" | "warn" }) {
  return (
    <div className="min-h-28 border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 text-xl font-bold text-foreground", tone === "up" && "text-success", tone === "warn" && "text-warning")}>{value}</p>
      <p className="mt-2 text-[11px] text-faint">{detail}</p>
    </div>
  );
}

function HomeView({ data, onNavigate }: { data: Dataset; onNavigate: (view: ViewKey) => void }) {
  const latest = data.series.daily.at(-1);
  return (
    <>
      <PageIntro
        title="Domestic Airfare Intelligence Overview"
        description="A consolidated operational view of fare collection, index movement, route conditions and statistical quality across the monitored domestic network."
        action={<Button onClick={() => onNavigate("index")}>Open Airfare Index <ChevronRight /></Button>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Current Airfare Index" value={latest?.fisher.toFixed(2) ?? "—"} detail="Fisher Ideal · Base 100" />
        <MetricCard label="Routes Monitored" value={String(ROUTES.length)} detail="DGCA traffic-weighted basket" />
        <MetricCard label="Validated Observations" value={data.report.usable.toLocaleString("en-IN")} detail={`${data.observationDays} collection days`} tone="up" />
        <MetricCard label="Surge Alerts" value={String(data.anomalies.length)} detail="Z-score threshold ≥ 2.0" tone="warn" />
      </div>
      <Section title="Operational Modules" icon={<Activity className="size-4" />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["live", "Live Price Monitor", "Run a fresh collection cycle and inspect current route fares."],
            ["route", "Route Analysis", "Compare route weights, index contribution and fare movement."],
            ["lead", "Lead-Time Analysis", "Measure fare premiums across T+1 to T+45 horizons."],
            ["pipeline", "Data Pipeline", "Review cleaning outcomes and collection provenance."],
          ].map(([id, title, copy]) => (
            <Button key={id} variant="outline" onClick={() => onNavigate(id as ViewKey)} className="h-auto min-h-28 justify-start whitespace-normal rounded-none p-4 text-left">
              <p className="font-semibold text-primary">{title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p>
            </Button>
          ))}
        </div>
      </Section>
    </>
  );
}

function IndexView({ data, frequency, setFrequency, onNavigate }: { data: Dataset; frequency: Frequency; setFrequency: (value: Frequency) => void; onNavigate: (view: ViewKey) => void }) {
  const series = data.series[frequency];
  const latest = series.at(-1);
  const previous = series.at(-2) ?? latest;
  const dailyChange = latest && previous ? latest.fisher - previous.fisher : 0;
  const weekAgo = data.series.daily.at(-8) ?? data.series.daily.at(0);
  const weeklyChange = latest && weekAgo ? latest.fisher - weekAgo.fisher : 0;
  const monthly = data.series.monthly;
  const monthlyChange = monthly.length > 1 ? (monthly.at(-1)?.fisher ?? 0) - (monthly.at(-2)?.fisher ?? 0) : 0;

  return (
    <>
      <PageIntro
        title="Airfare Price Index (API-IN)"
        description="The Airfare Price Index measures changes in representative domestic airfares over time across India's domestic aviation network. It is calibrated against a basket of high-traffic city-pairs weighted by passenger volume."
        action={
          <div className="flex gap-2">
            <Button onClick={() => onNavigate("methodology")}><BookOpen /> View Methodology</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print Bulletin</Button>
          </div>
        }
      />

      <Section title="Statistical distinction: Ticket Price vs Index Value" icon={<Info className="size-5" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="border border-info-border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Monetary measure</p>
            <p className="num mt-2 text-lg font-bold">Ticket price: {inr(data.stats[0]?.avgFare)}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">The actual currency amount paid for a specific seat, flight, departure date and booking lead-time.</p>
          </div>
          <div className="border border-info-border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Relative index measure</p>
            <p className="num mt-2 text-lg font-bold text-primary">Index value: {latest?.fisher.toFixed(2) ?? "—"}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">A unitless statistical aggregate normalized to FY 2024–25 = 100 for consistent period comparison.</p>
          </div>
        </div>
      </Section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Current Index" value={latest?.fisher.toFixed(2) ?? "—"} detail={`Published ${data.lastObserved}`} />
        <MetricCard label="Previous Index" value={previous?.fisher.toFixed(2) ?? "—"} detail="Previous period" />
        <MetricCard label="Period Change" value={`${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}`} detail="Fisher index points" tone={dailyChange >= 0 ? "up" : "warn"} />
        <MetricCard label="Weekly Change" value={`${weeklyChange >= 0 ? "+" : ""}${weeklyChange.toFixed(2)}`} detail="Versus seven days prior" tone={weeklyChange >= 0 ? "up" : "warn"} />
        <MetricCard label="Monthly Change" value={`${monthlyChange >= 0 ? "+" : ""}${monthlyChange.toFixed(2)}`} detail="Month-on-month" tone={monthlyChange >= 0 ? "up" : "warn"} />
        <MetricCard label="Base Period" value="100.00" detail="FY 2024–25" />
      </div>

      <Section
        title="Airfare Index Movement"
        subtitle={`${series.length} ${frequency} periods · Fisher vs Laspeyres`}
        icon={<Activity className="size-4" />}
      >
        <div className="mb-4 flex gap-1">
          {(["daily", "weekly", "monthly"] as Frequency[]).map((item) => (
            <Button key={item} size="sm" variant={frequency === item ? "default" : "outline"} onClick={() => setFrequency(item)} className="rounded-none capitalize">
              {item}
            </Button>
          ))}
        </div>
        <LineChart
          height={260}
          labels={series.map((point) => point.period)}
          series={[
            { key: "fisher", label: "Fisher", color: "var(--color-primary)", values: series.map((point) => point.fisher) },
            { key: "laspeyres", label: "Laspeyres", color: "var(--color-warning)", values: series.map((point) => point.laspeyres), dashed: true },
          ]}
        />
      </Section>
      <RouteContributionTable data={data} />
    </>
  );
}

function RouteContributionTable({ data }: { data: Dataset }) {
  return (
    <Section title="Route-wise basket contribution" subtitle="Breakdown of route weights and price relatives">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[1000px]">
          <thead><tr><th>Route Code</th><th>Corridor Name</th><th>Route Weight</th><th>Base Price</th><th>Current Fare</th><th>Price Relative</th><th>Contribution</th><th>MoM Impact</th></tr></thead>
          <tbody>
            {data.stats.map((stat) => {
              const route = ROUTES.find((item) => item.id === stat.routeId);
              return (
                <tr key={stat.routeId}>
                  <td className="num font-bold text-primary">{stat.routeId}</td>
                  <td>{route ? `${CITY_NAMES[route.origin]} (${route.origin}) → ${CITY_NAMES[route.dest]} (${route.dest})` : stat.routeId}</td>
                  <td className="num text-right font-semibold">{(stat.weight * 100).toFixed(1)}%</td>
                  <td className="num text-right">{inr(route?.baseFare)}</td>
                  <td className="num text-right font-bold">{inr(stat.avgFare)}</td>
                  <td className="num text-right font-semibold text-primary">{stat.index.toFixed(2)}</td>
                  <td className="num text-right font-bold">{(stat.weight * stat.index).toFixed(2)} pts</td>
                  <td className={cn("num text-right", stat.momPct >= 0 ? "text-warning" : "text-success")}>{stat.momPct >= 0 ? "+" : ""}{stat.momPct.toFixed(2)} pts</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function LiveView({ data, scraping, progress, mode, runLiveCycle }: { data: Dataset; scraping: boolean; progress: number; mode: "replay" | "live"; runLiveCycle: () => void }) {
  return (
    <>
      <PageIntro
        title="Live Domestic Fare Monitor"
        description="Current route-level fare intelligence across monitored carriers and booking horizons, validated through the AIRTRACE collection pipeline."
        action={<Button onClick={runLiveCycle} disabled={scraping}><Activity /> {scraping ? `Collecting ${progress}%` : "Run Live Collection"}</Button>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pipeline Mode" value={mode.toUpperCase()} detail={scraping ? `${progress}% cycle completion` : "Collection ready"} tone="up" />
        <MetricCard label="Records Today" value={data.report.total.toLocaleString("en-IN")} detail="Across all route windows" />
        <MetricCard label="Usable Quotes" value={data.report.usable.toLocaleString("en-IN")} detail="Post validation and cleaning" tone="up" />
        <MetricCard label="Exceptions" value={(data.report.outliers + data.report.cancelled).toLocaleString("en-IN")} detail="Outliers and cancellations" tone="warn" />
      </div>
      <Section title="Current route snapshot" subtitle={`Last updated ${data.lastObserved}`} icon={<Plane className="size-4" />}>
        <div className="overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Route</th><th>Index</th><th>Average Fare</th>{WINDOWS.map((window) => <th key={window}>T+{window}</th>)}<th>Observations</th></tr></thead><tbody>{data.stats.map((stat) => <tr key={stat.routeId}><td className="num font-bold text-primary">{stat.routeId}</td><td className="num font-semibold">{stat.index.toFixed(2)}</td><td className="num font-bold">{inr(stat.avgFare)}</td>{WINDOWS.map((window) => <td key={window} className="num">{inr(stat.latestByWindow[window])}</td>)}<td className="num">{stat.observations.toLocaleString("en-IN")}</td></tr>)}</tbody></table></div>
      </Section>
      <Section title="Active fare movement alerts" icon={<Info className="size-4" />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.anomalies.slice(0, 8).map((item) => <div key={`${item.routeId}-${item.window}-${item.observedOn}`} className="border border-warning/40 bg-warning-soft p-3"><div className="flex justify-between"><strong className="num text-primary">{item.routeId}</strong><strong className="num text-warning">{item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(1)}%</strong></div><p className="mt-2 text-xs text-muted-foreground">T+{item.window} · z={item.z.toFixed(1)} · {item.observedOn}</p></div>)}</div>
      </Section>
    </>
  );
}

function RouteView({ data, routeId, setRouteId }: { data: Dataset; routeId: string; setRouteId: (id: string) => void }) {
  const route = ROUTES.find((item) => item.id === routeId) ?? ROUTES[0];
  const stat = data.stats.find((item) => item.routeId === routeId) ?? data.stats[0];
  if (!route || !stat) return null;
  const routeQuotes = data.cleaned.filter((quote) => quote.routeId === routeId && quote.usable && quote.totalFare != null);
  const byCarrier = CARRIERS.map((carrier) => {
    const values = routeQuotes.filter((quote) => quote.carrier === carrier).map((quote) => quote.totalFare ?? 0);
    return { carrier, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
  });
  const maxCarrier = Math.max(...byCarrier.map((item) => item.value), 1);
  return (
    <>
      <PageIntro title="Route Analysis" description="Corridor-level fare movement, cross-carrier spread, lead-time behavior and basket contribution for each monitored domestic city-pair." action={<select aria-label="Select route" value={routeId} onChange={(event) => setRouteId(event.target.value)} className="h-9 border border-input bg-background px-3 text-sm font-semibold text-primary">{ROUTES.map((item) => <option key={item.id}>{item.id}</option>)}</select>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Avg Observed Fare" value={inr(stat.avgFare)} detail="All validated quotes" />
        <MetricCard label="Minimum Fare" value={inr(Math.min(...routeQuotes.map((quote) => quote.totalFare ?? Infinity)))} detail="Observed minimum" tone="up" />
        <MetricCard label="Maximum Fare" value={inr(Math.max(...routeQuotes.map((quote) => quote.totalFare ?? 0)))} detail="Observed maximum" />
        <MetricCard label="Route Index" value={stat.index.toFixed(2)} detail="Base 100" />
        <MetricCard label="Fare Movement" value={`${stat.momPct >= 0 ? "+" : ""}${stat.momPct.toFixed(2)}%`} detail="Month-on-month" tone={stat.momPct >= 0 ? "warn" : "up"} />
        <MetricCard label="Observations" value={stat.observations.toLocaleString("en-IN")} detail="Validated records" />
        <MetricCard label="Route Weight" value={`${(stat.weight * 100).toFixed(1)}%`} detail="DGCA proxy" />
        <MetricCard label="Last Updated" value="08:24" detail="Batch validated" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Section title={`Fare movement trend: ${routeId}`} subtitle="Unit: Average Fare (₹)" className="mb-0"><LineChart height={210} labels={WINDOWS.map((window) => `T+${window}`)} series={[{ key: "fare", label: "Fare", color: "var(--color-primary)", values: WINDOWS.map((window) => stat.latestByWindow[window] ?? 0) }]} valueFormat={(value) => inr(value)} /></Section>
        <Section title={`Cross-carrier fare spread: ${routeId}`} subtitle="Unit: Average Fare (₹)" className="mb-0"><div className="flex h-[210px] items-end gap-4 px-4">{byCarrier.map((item) => <div key={item.carrier} className="flex flex-1 flex-col items-center gap-2"><span className="num text-[10px] font-semibold">{inr(item.value)}</span><div className="w-full bg-primary" style={{ height: `${Math.max(12, (item.value / maxCarrier) * 145)}px` }} /><span className="text-center text-[10px] text-muted-foreground">{item.carrier}</span></div>)}</div></Section>
        <Section title={`Lead-time surge curve: ${routeId}`} subtitle="T+1 to T+45 booking windows" className="mb-0"><LineChart height={210} labels={WINDOWS.map((window) => `T+${window}`)} series={[{ key: "lead", label: "Fare", color: "var(--color-primary)", values: WINDOWS.map((window) => stat.latestByWindow[window] ?? 0) }]} valueFormat={(value) => inr(value)} /></Section>
      </div>
      <Section title={`Corridor profile & statistical context: ${CITY_NAMES[route.origin]} (${route.origin}) ↔ ${CITY_NAMES[route.dest]} (${route.dest})`} icon={<Info className="size-4" />} className="mt-5">
        <div className="grid gap-6 md:grid-cols-3"><div><h3 className="font-bold text-primary">Aviation Infrastructure</h3><p className="mt-3 text-sm leading-7 text-muted-foreground"><strong className="text-foreground">Primary corridor:</strong> {route.origin} to {route.dest}<br /><strong className="text-foreground">Tracked carriers:</strong> {CARRIERS.length}<br /><strong className="text-foreground">Collection windows:</strong> {WINDOWS.length}</p></div><div><h3 className="font-bold text-primary">Regulatory & Weighting Notes</h3><p className="mt-3 text-sm leading-7 text-muted-foreground"><strong className="text-foreground">DGCA proxy share:</strong> {(stat.weight * 100).toFixed(1)}%<br /><strong className="text-foreground">Base-period anchor:</strong> {inr(route.baseFare)}<br /><strong className="text-foreground">Price relative:</strong> {stat.index.toFixed(2)} pts</p></div><div><h3 className="font-bold text-primary">Fare Benchmark</h3><p className="mt-3 text-sm leading-7 text-muted-foreground"><strong className="text-foreground">Average fare:</strong> {inr(stat.avgFare)}<br /><strong className="text-foreground">Latest T+7 fare:</strong> {inr(stat.latestByWindow[7])}<br /><strong className="text-foreground">Observed quotes:</strong> {stat.observations.toLocaleString("en-IN")}</p></div></div>
      </Section>
    </>
  );
}

function LeadTimeView({ data, onNavigate }: { data: Dataset; onNavigate: (view: ViewKey) => void }) {
  return (
    <>
      <PageIntro title="Lead-Time Pricing Horizon Analysis" description="Analysis of fare progression as a function of the advance booking horizon. Evaluates dynamic yield management across Indian carriers to establish baseline pricing sweet-spots for consumer price index standardization." action={<Button variant="outline" onClick={() => onNavigate("methodology")}><BookOpen /> Methodology Notes</Button>} />
      <Section title="Lead-time horizon methodology & reference calendar" subtitle={`Collection date: ${data.lastObserved}`} icon={<Clock3 className="size-4" />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{data.elasticity.map((item) => <div key={item.window} className="border border-border bg-secondary/30 p-4"><div className="flex items-center justify-between border-b border-border pb-3"><strong className="num text-primary">T+{item.window}</strong><span className="border border-border bg-card px-2 py-1 text-xs">+{item.window} Days</span></div><p className="mt-3 text-xs text-muted-foreground">Average Observed Fare:</p><p className="num mt-1 text-lg font-bold text-primary">{inr(item.avgFare)}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{item.window <= 7 ? "Short-horizon urgent and business travel. Highest dynamic yield premium." : item.window <= 15 ? "Planned personal and corporate travel window. Pricing stabilizes." : "Advance-purchase inventory and representative baseline fare."}</p></div>)}</div>
        <div className="mt-3 border border-info-border bg-info-soft p-3 text-xs leading-5 text-primary"><strong>Statistical Rationale:</strong> AIRTRACE samples five explicit lead-time horizons simultaneously to isolate true price inflation from advance booking yield premiums.</div>
      </Section>
      <Section title="Lead-time fare and premium curve" subtitle="T+45 baseline = 0% premium"><div className="grid gap-5 lg:grid-cols-2"><LineChart height={260} labels={data.elasticity.map((item) => `T+${item.window}`)} series={[{ key: "fare", label: "Average Fare", color: "var(--color-primary)", values: data.elasticity.map((item) => item.avgFare) }]} valueFormat={(value) => inr(value)} /><div className="flex h-[260px] items-end gap-4">{data.elasticity.map((item) => <div key={item.window} className="flex flex-1 flex-col items-center gap-2"><span className="num text-xs font-bold text-warning">+{item.premiumPct.toFixed(0)}%</span><div className="w-full bg-primary" style={{ height: `${Math.max(14, (item.avgFare / Math.max(...data.elasticity.map((value) => value.avgFare))) * 175)}px` }} /><span className="num text-xs">T+{item.window}</span></div>)}</div></div></Section>
    </>
  );
}

function exportCsv(data: Dataset) {
  const head = ["id", "carrier", "route", "flight_date", "lead_time", "base_fare", "taxes", "convenience_fee", "total_fare", "source", "collection_date"];
  const rows = data.cleaned.filter((q) => q.usable).map((q) => [q.id, q.carrier, q.routeId, q.flightDate, `T+${q.window}`, q.baseFare ?? "", q.taxes ?? "", q.convenienceFee ?? "", q.totalFare, q.source, q.observedOn]);
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `airtrace-observations-${data.lastObserved}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExplorerView({ data }: { data: Dataset }) {
  const records = data.cleaned.filter((quote) => quote.usable).slice(-25).reverse();
  return (
    <>
      <PageIntro title="Normalized Statistical Fare Observations" description="Validated record-level observations from the normalized AIRTRACE collection corpus. Monetary components remain separate wherever the source provides itemized fare data." action={<Button variant="outline" onClick={() => exportCsv(data)}><Database /> Export Records</Button>} />
      <Section title="Normalized statistical fare observations" subtitle={`Showing ${records.length} records matching criteria`}>
        <div className="overflow-x-auto"><table className="data-table min-w-[1250px]"><thead><tr><th>Record ID</th><th>Airline</th><th>Route</th><th>Flight Date</th><th>Lead Time</th><th>Base Fare</th><th>Taxes</th><th>Fees</th><th>Total Fare</th><th>Source Feed</th><th>Collection Date</th></tr></thead><tbody>{records.map((quote) => <tr key={quote.id}><td className="num font-bold text-primary">{quote.id}</td><td className="font-semibold">{quote.carrier}</td><td className="num">{quote.routeId}</td><td className="num">{quote.flightDate}</td><td className="num">T+{quote.window}</td><td className="num text-right">{inr(quote.baseFare)}</td><td className="num text-right">{inr(quote.taxes)}</td><td className="num text-right">{inr(quote.convenienceFee)}</td><td className="num text-right font-bold">{inr(quote.totalFare)}</td><td>{quote.source}</td><td className="num">{quote.observedOn}</td></tr>)}</tbody></table></div>
      </Section>
    </>
  );
}

function ReportsView({ data }: { data: Dataset }) {
  const [copied, setCopied] = useState(false);
  return <><PageIntro title="Statistical Reports & Policy Briefs" description="Publication-ready findings derived from the current airfare index, surge detector, lead-time model and official-series backtest." action={<Button variant="outline" onClick={() => window.print()}><Printer /> Print Report</Button>} /><div className="grid gap-5 lg:grid-cols-2"><Section title="Current policy brief" icon={<FileText className="size-4" />} className="mb-0"><p className="text-sm leading-7 text-muted-foreground">{data.brief}</p><Button size="sm" variant="outline" className="mt-4" onClick={() => { void navigator.clipboard?.writeText(data.brief); setCopied(true); setTimeout(() => setCopied(false), 1600); }}><Copy /> {copied ? "Copied" : "Copy Brief"}</Button></Section><Section title="Backtest against official transport proxy" subtitle={`Correlation r = ${data.backtest.correlation.toFixed(2)}`} className="mb-0"><LineChart height={245} labels={data.backtest.points.map((point) => point.period)} series={[{ key: "airtrace", label: "AIRTRACE", color: "var(--color-primary)", values: data.backtest.points.map((point) => point.apix) }, { key: "official", label: "Official", color: "var(--color-warning)", values: data.backtest.points.map((point) => point.official), dashed: true }]} /><p className="mt-3 text-xs text-muted-foreground">MAD {data.backtest.meanAbsDeviation.toFixed(2)} pts · RMSE {data.backtest.rmse.toFixed(2)} · {data.backtest.days} days</p></Section></div></>;
}

function PipelineView({ data, log }: { data: Dataset; log: ComplianceEvent[] }) {
  const items = [["Probes Received", data.report.total], ["Usable Records", data.report.usable], ["Sold Out", data.report.soldOut], ["Cancelled", data.report.cancelled], ["Outliers Removed", data.report.outliers], ["Duplicates", data.report.deduped]] as const;
  return <><PageIntro title="Data Validation Pipeline" description="End-to-end accounting of collection, normalization, quality checks, outlier handling and index publication." /><div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{items.map(([label, value]) => <MetricCard key={label} label={label} value={value.toLocaleString("en-IN")} detail="Current corpus" tone={label === "Usable Records" ? "up" : label === "Outliers Removed" ? "warn" : "default"} />)}</div><Section title="Pipeline stages" icon={<Database className="size-4" />}><div className="grid gap-3 md:grid-cols-5">{["01 · Collect", "02 · Normalize", "03 · Validate", "04 · Index", "05 · Publish"].map((stage, index) => <div key={stage} className="border border-border p-4"><CheckCircle2 className="mb-3 size-5 text-success" /><p className="font-bold text-primary">{stage}</p><p className="mt-2 text-xs text-muted-foreground">{index === 0 ? "Compliant route-window requests" : index === 1 ? "Fare components standardized" : index === 2 ? "Status and IQR checks" : index === 3 ? "Fisher ideal aggregation" : "Dashboard and API refresh"}</p></div>)}</div></Section><Section title="Recent processing events" subtitle={`${log.length} events retained`}><EventTable log={log} /></Section></>;
}

function SourcesView({ data, log }: { data: Dataset; log: ComplianceEvent[] }) {
  return <><PageIntro title="Sources & Compliance" description="Source-level robots rules, request pacing and collection audit events keep the monitoring process transparent and reproducible." /><div className="grid gap-5 lg:grid-cols-2">{robotsSummary().map((source) => <Section key={source.id} title={source.label} icon={<ShieldCheck className="size-4" />} className="mb-0"><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Source ID</dt><dd className="num mt-1 font-semibold">{source.id}</dd></div><div><dt className="text-muted-foreground">Request limit</dt><dd className="num mt-1 font-semibold">1 / {crawlDelay(source.id).toFixed(1)}s</dd></div><div><dt className="text-muted-foreground">Allowed paths</dt><dd className="num mt-1 text-xs">{source.allow.join(", ")}</dd></div><div><dt className="text-muted-foreground">Robots status</dt><dd className="mt-1 font-semibold text-success">PASS</dd></div></dl></Section>)}</div><Section title="Compliance event ledger" subtitle={`${data.report.total.toLocaleString("en-IN")} source observations`} className="mt-5"><EventTable log={log} /></Section></>;
}

function EventTable({ log }: { log: ComplianceEvent[] }) {
  return <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Time</th><th>Source</th><th>Event</th><th>Detail</th><th>Status</th></tr></thead><tbody>{log.map((event, index) => <tr key={`${event.at}-${index}`}><td className="num">{event.at}</td><td className="num font-semibold">{event.source}</td><td className="capitalize">{event.kind}</td><td>{event.detail}</td><td className={event.ok ? "font-semibold text-success" : "font-semibold text-warning"}>{event.ok ? "PASS" : "RETRIED"}</td></tr>)}</tbody></table></div>;
}

function MethodologyView() {
  return <><PageIntro title="Index Methodology" description="Technical specification for basket construction, fare validation, weighting, aggregation, anomaly detection and release controls." /><Section title="Fisher Ideal Airfare Price Index" icon={<BookOpen className="size-4" />}><div className="grid gap-5 md:grid-cols-3"><MethodCard title="Laspeyres Index" formula="Lₜ = Σ(pₜq₀) / Σ(p₀q₀) × 100" copy="Measures current-period fares using base-period passenger quantities." /><MethodCard title="Paasche Index" formula="Pₜ = Σ(pₜqₜ) / Σ(p₀qₜ) × 100" copy="Measures current-period fares using current-period passenger quantities." /><MethodCard title="Fisher Ideal Index" formula="Fₜ = √(Lₜ × Pₜ)" copy="Geometric mean of Laspeyres and Paasche, reducing substitution bias." /></div></Section><Section title="Statistical controls"><div className="grid gap-4 md:grid-cols-2"><MethodCard title="Basket & Weights" formula="8 city-pairs · weights normalized to 1.000" copy="Representative domestic routes use DGCA passenger-traffic shares as transparent proxy weights." /><MethodCard title="Cleaning Rule" formula="Route × window IQR fence at 3×" copy="Implausible observations are excluded. Sold-out and cancelled flights are flagged and never treated as zero fares." /><MethodCard title="Lead-Time Windows" formula="T+1 · T+7 · T+15 · T+30 · T+45" copy="Five fixed horizons separate advance-purchase yield effects from underlying airfare inflation." /><MethodCard title="Surge Detector" formula="|z| ≥ 2.0 on day-on-day route movement" copy="Genuine price surges remain in the index but are separately flagged for policy review." /></div></Section></>;
}

function MethodCard({ title, formula, copy }: { title: string; formula: string; copy: string }) {
  return <div className="border border-border p-5"><h3 className="font-bold text-primary">{title}</h3><p className="num mt-3 border-y border-border bg-secondary/50 px-3 py-3 text-sm font-semibold">{formula}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p></div>;
}

function ApiView() {
  const endpoints = [{ path: "/api/public/v1/series?freq=daily", copy: "Daily, weekly or monthly index series with optional lead-time filter." }, { path: "/api/public/v1/series?freq=monthly&window=7", copy: "Monthly index series restricted to the T+7 booking horizon." }, { path: "/api/public/v1/routes", copy: "Route weights, current index values, mean fares and observations." }, { path: "/api/public/v1/anomalies", copy: "Surge flags, cleaning report, backtest metrics and current policy brief." }];
  return <><PageIntro title="AIRTRACE Public API Reference" description="Open read-only JSON endpoints for statistical agencies, researchers and policy systems. Responses share the same validated calculation engine as this workspace." /><Section title="Available endpoints" icon={<Database className="size-4" />}><div className="space-y-3">{endpoints.map((endpoint) => <div key={endpoint.path} className="flex flex-col gap-3 border border-border p-4 md:flex-row md:items-center"><span className="w-fit bg-success-soft px-2 py-1 text-xs font-bold text-success">GET</span><code className="num flex-1 break-all text-sm text-primary">{endpoint.path}</code><p className="max-w-lg text-xs text-muted-foreground">{endpoint.copy}</p><Button size="icon" variant="outline" asChild><a href={endpoint.path} target="_blank" rel="noreferrer" aria-label={`Open ${endpoint.path}`}><ExternalLink /></a></Button></div>)}</div></Section></>;
}

function AdminView({ data, runLiveCycle, scraping }: { data: Dataset; runLiveCycle: () => void; scraping: boolean }) {
  return <><PageIntro title="Admin / Data Operations" description="Operational controls and publication readiness checks for the current AIRTRACE statistical release." action={<Button onClick={runLiveCycle} disabled={scraping}><Activity /> {scraping ? "Collection Running" : "Start Collection Cycle"}</Button>} /><div className="grid gap-5 lg:grid-cols-2"><Section title="Release readiness" icon={<CheckCircle2 className="size-4" />} className="mb-0"><div className="space-y-3">{[["Data validation", `${data.report.usable.toLocaleString("en-IN")} usable quotes`], ["Route coverage", `${ROUTES.length} of ${ROUTES.length} corridors`], ["Weight normalization", "1.000 basket total"], ["Public API", "Available"]].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-border pb-3 text-sm"><span>{label}</span><span className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="size-4" /> {value}</span></div>)}</div></Section><Section title="Current release" icon={<FileText className="size-4" />} className="mb-0"><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Bulletin</dt><dd className="num mt-1 font-bold">AT-2026/09</dd></div><div><dt className="text-muted-foreground">Observation date</dt><dd className="num mt-1 font-bold">{data.lastObserved}</dd></div><div><dt className="text-muted-foreground">Index base</dt><dd className="num mt-1 font-bold">FY 2024–25 = 100</dd></div><div><dt className="text-muted-foreground">Status</dt><dd className="mt-1 font-bold text-success">READY</dd></div></dl></Section></div></>;
}
