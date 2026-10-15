import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Constantes ──────────────────────────────────────────────────────────────
const GID_GERENCIAL = "2073814116";
const SHEET_API = "/api/sheet";
const UPDATE_API = "/api/update-sheet";

const TIPO_OPTS = ["Reajuste", "DT", "Renovação", "Negócio Perdido", "Upselling", "Alteração de Escopo"];
const STATUS_OPTS = ["Em Negociação", "Em Negociação Antecipada", "Aguardando Reajuste", "Concluído", "Negócio Perdido", "Aprovado", "Pendente Cliente"];

// Paleta In-Haus GPS
const C = {
  azul:      "#006080",
  azulMedio: "#007fa3",
  azulClaro: "#e6f4f8",
  cinzaEscuro:"#2d3748",
  cinzaMedio: "#4a5568",
  cinzaClaro: "#718096",
  borda:     "#d1dde3",
  bg:        "#f5f8fa",
  bgCard:    "#ffffff",
  bgSidebar: "#ffffff",
  verde:     "#0a8a5c",
  verdeClaro:"#e6f7f1",
  vermelho:  "#c0392b",
  vermelhoClaro:"#fdf0ee",
  laranja:   "#c96b00",
  laranjaClaro:"#fef3e2",
  roxo:      "#6c3fb5",
  roxoClaro: "#f0ebfb",
  ciano:     "#007fa3",
  cianoClaro:"#e6f4f8",
};

const TIPO_COR = {
  "Reajuste":            C.azul,
  "DT":                  C.roxo,
  "Renovação":           C.verde,
  "Negócio Perdido":     C.vermelho,
  "Upselling":           C.laranja,
  "Alteração de Escopo": C.ciano,
};

const TIPO_BG = {
  "Reajuste":            C.azulClaro,
  "DT":                  C.roxoClaro,
  "Renovação":           C.verdeClaro,
  "Negócio Perdido":     C.vermelhoClaro,
  "Upselling":           C.laranjaClaro,
  "Alteração de Escopo": C.cianoClaro,
};

// ─── Utilitários ─────────────────────────────────────────────────────────────
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const clean = s.replace(/%$/, "");
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  if (s.endsWith("%")) return n / 100;
  return n;
};

const pctFmt = (v) => {
  const n2 = num(v);
  if (!n2 && n2 !== 0) return "—";
  const pct = Math.abs(n2) <= 1 ? n2 * 100 : n2;
  return `${pct.toFixed(2).replace(".", ",")}%`;
};

const brlFmt = (v) => {
  const n2 = num(v);
  if (!n2) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n2);
};

const parseData = (s) => {
  if (!s && s !== 0) return null;
  if (typeof s === "number") {
    const d = new Date(Math.round((s - 25569) * 86400 * 1000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const str = String(s).trim();
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  return null;
};

const diasEntre = (a, b) => {
  if (!a || !b) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const mesOrd = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const mesNum = (m) => {
  const i = mesOrd.findIndex(x => x.toLowerCase() === (m||"").toLowerCase());
  return i >= 0 ? i : 99;
};

const statusTemporal = (row) => {
  const hoje = new Date();
  const mesIdx = mesOrd.findIndex(x => x.toLowerCase() === (row.mes || "").toLowerCase());
  const anoAtual = hoje.getFullYear();
  const dataVig = mesIdx >= 0 ? new Date(anoAtual, mesIdx, 1) : null;
  const inicio = parseData(row.inicioNeg);
  const aprovacao = parseData(row.dataAprov);
  if (aprovacao) return null;
  if (inicio && dataVig && dataVig > hoje) return "Em Negociação Antecipada";
  if (inicio) return "Em Negociação";
  if (dataVig && dataVig > hoje) return "Aguardando Reajuste";
  return null;
};

// ─── Fetch ───────────────────────────────────────────────────────────────────
const fetchSheet = async (gid) => {
  const r = await fetch(`${SHEET_API}?gid=${gid}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return json.values || [];
};

const parseGerencial = (values) => {
  if (!values || values.length < 2) return [];
  const [header, ...rows] = values;
  const idx = (name) => header.findIndex(h => h?.toString().trim().toLowerCase() === name.toLowerCase());
  const iMes = idx("Mês Vigência");
  const iGrupo = idx("Grupo Cliente");
  const iCR = idx("CR");
  const iDescri = idx("Descri CR");
  const iGerente = idx("Gerente Regional");
  const iStatus = idx("Status Real");
  const iTipo = idx("Tipo de Negócio");
  const iDevido = idx("Devido (%)");
  const iAplic = idx("Aplicado (%)");
  const iValorAtual = idx("Valor Contrato Atual");
  const iValorFinal = idx("Valor Final/Pleito");
  const iInicio = idx("Inicio Negociação");
  const iAprov = idx("Data de Aprovação");
  const iInfo = idx("Informações");
  const iObs = idx("Observações");

  return rows.filter(r => r && r[iCR]).map((r, i) => ({
    _idx: i + 1,
    mes: r[iMes] || "",
    grupoCliente: r[iGrupo] || "",
    cr: String(r[iCR] || "").trim(),
    descri: r[iDescri] || "",
    gerente: r[iGerente] || "",
    status: r[iStatus] || "",
    tipo: r[iTipo] || "",
    devido: r[iDevido] ?? "",
    aplicado: r[iAplic] ?? "",
    valorAtual: r[iValorAtual] ?? "",
    valorFinal: r[iValorFinal] ?? "",
    inicioNeg: r[iInicio] ?? "",
    dataAprov: r[iAprov] ?? "",
    info: r[iInfo] || "",
    obs: r[iObs] || "",
  }));
};

// ─── Logo In-Haus inline ─────────────────────────────────────────────────────
const LogoInHaus = ({ small }) => (
  <div style={{ lineHeight: 1, textAlign: "center" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 0, justifyContent: "center" }}>
      <span style={{ fontWeight: 700, fontSize: small ? 18 : 22, color: "#fff", letterSpacing: "-0.5px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>In</span>
      <span style={{ fontWeight: 700, fontSize: small ? 18 : 22, color: "rgba(255,255,255,0.75)", letterSpacing: "-0.5px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>·Haus</span>
    </div>
    <div style={{ fontSize: small ? 8 : 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.22em", marginTop: 2, fontWeight: 400, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      logística
    </div>
  </div>
);

// ─── Toast ───────────────────────────────────────────────────────────────────
const Toast = ({ msg, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: C.verde, color: "#fff", padding: "10px 20px",
      borderRadius: 8, fontWeight: 600, fontSize: 13,
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>✓ {msg}</div>
  );
};

// ─── Badge ───────────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 4,
    background: bg || (color + "18"), color: color || C.azul,
    fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    border: `1px solid ${color || C.azul}30`
  }}>{label}</span>
);

// ─── Edição inline ───────────────────────────────────────────────────────────
const EditableCell = ({ value, opts, onSave, type = "select" }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(val);
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    if (type === "select") {
      return (
        <select value={val} onChange={e => setVal(e.target.value)} onBlur={save} autoFocus
          style={{ fontSize: 12, padding: "3px 6px", borderRadius: 4, border: `1.5px solid ${C.azul}`, background: "#fff", color: C.cinzaEscuro, outline: "none" }}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <input type="text" value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => e.key === "Enter" && save()} autoFocus
        style={{ width: 70, fontSize: 12, padding: "3px 6px", borderRadius: 4, border: `1.5px solid ${C.azul}`, background: "#fff", color: C.cinzaEscuro, textAlign: "center", outline: "none" }} />
    );
  }

  return (
    <span onClick={() => { setVal(value); setEditing(true); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 6px", borderRadius: 4, transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = C.azulClaro}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{ color: C.cinzaEscuro, fontSize: 12 }}>{value || "—"}</span>
      <span style={{ opacity: 0.35, fontSize: 10 }}>✏</span>
      {saving && <span style={{ fontSize: 10, color: C.cinzaClaro }}>…</span>}
    </span>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, color, sub }) => (
  <div style={{
    background: C.bgCard, borderRadius: 10, padding: "14px 18px",
    border: `1px solid ${C.borda}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    borderTop: `3px solid ${color || C.azul}`
  }}>
    <div style={{ fontSize: 11, color: C.cinzaClaro, marginBottom: 4, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || C.cinzaEscuro, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: C.cinzaClaro, marginTop: 3 }}>{sub}</div>}
  </div>
);

// ─── Seção Gestão de Reajustes ────────────────────────────────────────────────
const SecaoGerencial = ({ dados, onUpdate, setToast, filtros }) => {
  const [expandido, setExpandido] = useState({});
  const { busca, filtroMes, filtroGerente, filtroStatus, filtroTipo } = filtros;

  const filtrado = useMemo(() => dados.filter(d => {
    if (busca && !`${d.cr} ${d.grupoCliente} ${d.descri} ${d.gerente}`.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroMes.length && !filtroMes.includes(d.mes)) return false;
    if (filtroGerente.length && !filtroGerente.includes(d.gerente)) return false;
    if (filtroStatus.length) {
      const st = d.status || statusTemporal(d) || "";
      if (!filtroStatus.some(f => st.toLowerCase().includes(f.toLowerCase()))) return false;
    }
    if (filtroTipo && d.tipo !== filtroTipo) return false;
    return true;
  }), [dados, busca, filtroMes, filtroGerente, filtroStatus, filtroTipo]);

  const grupos = useMemo(() => {
    const map = {};
    filtrado.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = [];
      map[g].push(d);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrado]);

  // KPIs por status
  const kpiStatus = useMemo(() => {
    const m = {};
    filtrado.forEach(d => {
      const st = d.status || statusTemporal(d) || "Sem Status";
      m[st] = (m[st] || 0) + 1;
    });
    return m;
  }, [filtrado]);

  const STATUS_COR = {
    "Concluído":                { color: C.verde,    bg: C.verdeClaro },
    "Aprovado":                 { color: C.verde,    bg: C.verdeClaro },
    "Pendente Cliente":         { color: C.laranja,  bg: C.laranjaClaro },
    "Pendente GPS":             { color: C.azul,     bg: C.azulClaro },
    "Negócio Perdido":          { color: C.vermelho, bg: C.vermelhoClaro },
    "Em Negociação":            { color: C.azulMedio,bg: C.azulClaro },
    "Em Negociação Antecipada": { color: C.roxo,     bg: C.roxoClaro },
    "Aguardando Reajuste":      { color: C.laranja,  bg: C.laranjaClaro },
  };

  const salvar = async (row, campo, valor) => {
    try {
      const r = await fetch(UPDATE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cr: row.cr, campo, valor }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onUpdate(row.cr, campo, valor);
      setToast("Salvo com sucesso");
    } catch (e) {
      setToast("Erro ao salvar: " + e.message);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Total de CRs" value={filtrado.length} color={C.azul} />
        {Object.entries(kpiStatus).sort((a,b) => b[1]-a[1]).map(([st, c]) => {
          const cor = STATUS_COR[st] || { color: C.cinzaMedio, bg: C.bg };
          return <KpiCard key={st} label={st} value={c} color={cor.color} />;
        })}
      </div>

      {/* Tabela por grupo */}
      {grupos.map(([grupo, rows]) => {
        const aberto = expandido[grupo] !== false;
        const tiposGrupo = [...new Set(rows.map(r => r.tipo).filter(Boolean))];
        const statusGrupo = [...new Set(rows.map(r => r.status || statusTemporal(r)).filter(Boolean))];
        const temPerdido = statusGrupo.some(s => s?.includes("Perdido"));
        const temConcluido = statusGrupo.every(s => s?.includes("Concluído") || s?.includes("Aprovado"));

        return (
          <div key={grupo} style={{ background: C.bgCard, borderRadius: 10, marginBottom: 8, border: `1px solid ${C.borda}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
              style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: aberto ? `1px solid ${C.borda}` : "none" }}>
              <span style={{ color: C.cinzaClaro, fontSize: 10 }}>{aberto ? "▼" : "▶"}</span>
              <span style={{ fontWeight: 700, color: C.cinzaEscuro, fontSize: 13 }}>{grupo}</span>
              <span style={{ fontSize: 11, color: C.cinzaClaro, fontWeight: 400 }}>{rows.length} contrato{rows.length !== 1 ? "s" : ""}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
                {temPerdido && <Badge label="Negócio Perdido" color={C.vermelho} bg={C.vermelhoClaro} />}
                {temConcluido && !temPerdido && <Badge label="Concluído" color={C.verde} bg={C.verdeClaro} />}
                {tiposGrupo.map(t => <Badge key={t} label={t} color={TIPO_COR[t] || C.cinzaMedio} bg={TIPO_BG[t] || C.azulClaro} />)}
              </div>
            </div>
            {aberto && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["CR","Descrição","Mês","Gerente Regional","Devido %","Aplicado %","Prazo de Negociação","Tipo","Status"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.cinzaClaro, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: `1px solid ${C.borda}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const inicio = parseData(row.inicioNeg);
                      const aprov = parseData(row.dataAprov);
                      const dias = diasEntre(inicio, aprov || new Date());
                      const concluido = !!aprov;
                      const stTemp = statusTemporal(row);

                      return (
                        <tr key={row.cr + i} style={{ borderBottom: `1px solid #f0f4f7`, background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                          <td style={{ padding: "8px 12px", color: C.cinzaMedio, fontFamily: "monospace", fontSize: 11 }}>{row.cr}</td>
                          <td style={{ padding: "8px 12px", color: C.cinzaEscuro, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descri}</td>
                          <td style={{ padding: "8px 12px", color: C.cinzaMedio, whiteSpace: "nowrap" }}>{row.mes}</td>
                          <td style={{ padding: "8px 12px", color: C.cinzaEscuro, whiteSpace: "nowrap", fontWeight: 500 }}>{row.gerente}</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                            <EditableCell value={pctFmt(row.devido)} type="text" onSave={(v) => salvar(row, "Devido (%)", v)} />
                          </td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                            <EditableCell value={pctFmt(row.aplicado)} type="text" onSave={(v) => salvar(row, "Aplicado (%)", v)} />
                          </td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                            {stTemp ? (
                              <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 4,
                                background: stTemp.includes("Antecipada") ? C.roxoClaro : C.azulClaro,
                                color: stTemp.includes("Antecipada") ? C.roxo : C.azul,
                                fontSize: 11, fontWeight: 600
                              }}>{stTemp}</span>
                            ) : dias !== null ? (
                              <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                                background: concluido ? C.verdeClaro : C.laranjaClaro,
                                color: concluido ? C.verde : C.laranja
                              }}>
                                {concluido ? "✓" : "⏳"} {dias}d
                              </span>
                            ) : <span style={{ color: C.borda }}>—</span>}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <EditableCell value={row.tipo} opts={TIPO_OPTS} type="select" onSave={(v) => salvar(row, "Tipo de Negócio", v)} />
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <EditableCell value={row.status} opts={STATUS_OPTS} type="select" onSave={(v) => salvar(row, "Status Real", v)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {grupos.length === 0 && (
        <div style={{ color: C.cinzaClaro, textAlign: "center", marginTop: 60, fontSize: 14 }}>Nenhum registro encontrado</div>
      )}
    </div>
  );
};

// ─── Seção Controle Econômico ─────────────────────────────────────────────────
const SecaoEconomico = ({ dados, filtros }) => {
  const { filtroGerente, filtroMes, filtroTipo } = filtros;
  const [expandido, setExpandido] = useState({});

  const tipos = useMemo(() => [...new Set(dados.map(d => d.tipo).filter(Boolean))].sort(), [dados]);

  const filtrado = useMemo(() => dados.filter(d => {
    if (filtroMes.length && !filtroMes.includes(d.mes)) return false;
    if (filtroGerente.length && !filtroGerente.includes(d.gerente)) return false;
    if (filtroTipo && d.tipo !== filtroTipo) return false;
    return num(d.valorAtual) > 0 || num(d.valorFinal) > 0;
  }), [dados, filtroMes, filtroGerente, filtroTipo]);

  const grupos = useMemo(() => {
    const map = {};
    filtrado.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = [];
      map[g].push(d);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrado]);

  const totalAtual = useMemo(() => filtrado.reduce((s, d) => s + num(d.valorAtual), 0), [filtrado]);
  const totalFinal = useMemo(() => filtrado.reduce((s, d) => s + num(d.valorFinal), 0), [filtrado]);
  const totalGanho = totalFinal - totalAtual;
  const pctGlobal = totalAtual > 0 ? (totalGanho / totalAtual) * 100 : 0;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Valor Total dos Contratos" value={brlFmt(totalAtual)} color={C.azul} />
        <KpiCard label="Valor Final / Pleito" value={brlFmt(totalFinal)} color={C.verde} />
        <KpiCard label="Ganho Estimado" value={brlFmt(totalGanho)} color={totalGanho >= 0 ? C.verde : C.vermelho} />
        <KpiCard label="Reajuste Médio" value={`${pctGlobal.toFixed(2).replace(".", ",")}%`} color={C.laranja} />
      </div>

      {grupos.map(([grupo, rows]) => {
        const gAtual = rows.reduce((s, d) => s + num(d.valorAtual), 0);
        const gFinal = rows.reduce((s, d) => s + num(d.valorFinal), 0);
        const gGanho = gFinal - gAtual;
        const gPct = gAtual > 0 ? (gGanho / gAtual) * 100 : 0;
        const aberto = expandido[grupo] !== false;

        return (
          <div key={grupo} style={{ background: C.bgCard, borderRadius: 10, marginBottom: 8, border: `1px solid ${C.borda}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
              style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: aberto ? `1px solid ${C.borda}` : "none" }}>
              <span style={{ color: C.cinzaClaro, fontSize: 10 }}>{aberto ? "▼" : "▶"}</span>
              <span style={{ fontWeight: 700, color: C.cinzaEscuro, fontSize: 13, flex: 1 }}>{grupo}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, textAlign: "right" }}>
                {[
                  { l: "Contrato Atual", v: brlFmt(gAtual), c: C.cinzaMedio },
                  { l: "Valor Final", v: brlFmt(gFinal), c: C.verde },
                  { l: "Ganho", v: brlFmt(gGanho), c: gGanho >= 0 ? C.verde : C.vermelho },
                  { l: "Reajuste", v: `${gPct.toFixed(2).replace(".", ",")}%`, c: C.laranja },
                ].map(({ l, v, c }) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: C.cinzaClaro }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {aberto && (
              <div style={{ overflowX: "auto", borderTop: `1px solid ${C.borda}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["CR","Descrição","Mês","Gerente","Tipo","Contrato Atual","Valor Final","Ganho","Reajuste"].map(h => (
                        <th key={h} style={{ padding: "7px 12px", textAlign: "left", color: C.cinzaClaro, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: `1px solid ${C.borda}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const vAtual = num(row.valorAtual);
                      const vFinal = num(row.valorFinal);
                      const ganho = vFinal - vAtual;
                      const pct = vAtual > 0 ? (ganho / vAtual) * 100 : 0;
                      return (
                        <tr key={row.cr + i} style={{ borderBottom: `1px solid #f0f4f7`, background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                          <td style={{ padding: "7px 12px", color: C.cinzaMedio, fontFamily: "monospace", fontSize: 11 }}>{row.cr}</td>
                          <td style={{ padding: "7px 12px", color: C.cinzaEscuro, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descri}</td>
                          <td style={{ padding: "7px 12px", color: C.cinzaMedio }}>{row.mes}</td>
                          <td style={{ padding: "7px 12px", color: C.cinzaEscuro, fontWeight: 500 }}>{row.gerente}</td>
                          <td style={{ padding: "7px 12px" }}><Badge label={row.tipo || "—"} color={TIPO_COR[row.tipo] || C.cinzaMedio} bg={TIPO_BG[row.tipo] || C.azulClaro} /></td>
                          <td style={{ padding: "7px 12px", color: C.cinzaMedio }}>{brlFmt(vAtual)}</td>
                          <td style={{ padding: "7px 12px", color: C.verde, fontWeight: 600 }}>{brlFmt(vFinal)}</td>
                          <td style={{ padding: "7px 12px", color: ganho >= 0 ? C.verde : C.vermelho, fontWeight: 600 }}>{brlFmt(ganho)}</td>
                          <td style={{ padding: "7px 12px", color: C.laranja, fontWeight: 700 }}>{pct.toFixed(2).replace(".", ",")}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {grupos.length === 0 && (
        <div style={{ color: C.cinzaClaro, textAlign: "center", marginTop: 60, fontSize: 14 }}>Nenhum registro com valores preenchidos</div>
      )}
    </div>
  );
};

// ─── App Principal ────────────────────────────────────────────────────────────
export default function App() {
  const [secao, setSecao] = useState("gerencial");
  const [menuAberto, setMenuAberto] = useState(true);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Filtros globais (compartilhados entre seções)
  const [busca, setBusca] = useState("");
  const [filtroMes, setFiltroMes] = useState([]);
  const [filtroGerente, setFiltroGerente] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("");

  const filtros = { busca, filtroMes, filtroGerente, filtroStatus, filtroTipo };
  const temFiltro = busca || filtroMes.length || filtroGerente.length || filtroStatus.length || filtroTipo;

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const values = await fetchSheet(GID_GERENCIAL);
      setDados(parseGerencial(values));
      setLastUpdate(new Date());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const gerentes = useMemo(() => [...new Set(dados.map(d => d.gerente).filter(Boolean))].sort(), [dados]);
  const meses = useMemo(() => [...new Set(dados.map(d => d.mes).filter(Boolean))].sort((a, b) => mesNum(a) - mesNum(b)), [dados]);

  const onUpdate = useCallback((cr, campo, valor) => {
    setDados(prev => prev.map(d => {
      if (d.cr !== cr) return d;
      const campoMap = { "Tipo de Negócio": "tipo", "Status Real": "status", "Devido (%)": "devido", "Aplicado (%)": "aplicado" };
      const key = campoMap[campo];
      return key ? { ...d, [key]: valor } : d;
    }));
  }, []);

  const toggle = (val) => (prev) => { const s = new Set(prev); s.has(val) ? s.delete(val) : s.add(val); return [...s]; };

  const SECOES = [
    { id: "gerencial", label: "Gestão de Reajustes Contratuais", icon: "📋" },
    { id: "economico", label: "Controle Econômico", icon: "📈" },
  ];
  const secaoAtual = SECOES.find(s => s.id === secao);

  // Label do filtro de status com cor
  const STATUS_COR_SIDEBAR = {
    "Concluído":                "rgba(10,138,92,0.8)",
    "Aprovado":                 "rgba(10,138,92,0.8)",
    "Pendente Cliente":         "rgba(201,107,0,0.8)",
    "Pendente GPS":             "rgba(255,255,255,0.7)",
    "Negócio Perdido":          "rgba(192,57,43,0.8)",
    "Em Negociação":            "rgba(255,255,255,0.65)",
    "Em Negociação Antecipada": "rgba(176,148,255,0.9)",
    "Aguardando Reajuste":      "rgba(201,107,0,0.8)",
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.cinzaEscuro, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar retrátil ─────────────────────────────────────────────── */}
      <div style={{
        width: menuAberto ? 240 : 52, flexShrink: 0,
        background: C.azul, display: "flex", flexDirection: "column",
        transition: "width 0.22s cubic-bezier(.4,0,.2,1)", overflow: "hidden",
        position: "relative"
      }}>
        {/* Logo + toggle */}
        <div style={{
          padding: menuAberto ? "18px 14px 14px" : "18px 0 14px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10
        }}>
          {menuAberto && <LogoInHaus />}
          <button
            onClick={() => setMenuAberto(v => !v)}
            title={menuAberto ? "Recolher menu" : "Expandir menu"}
            style={{
              background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6, color: "#fff", cursor: "pointer",
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, flexShrink: 0, transition: "background 0.15s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
          >
            {menuAberto ? "◀" : "▶"}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ padding: menuAberto ? "10px 8px" : "10px 6px" }}>
          {SECOES.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setSecao(id)} title={!menuAberto ? label : undefined} style={{
              display: "flex", alignItems: "center", gap: menuAberto ? 10 : 0,
              justifyContent: menuAberto ? "flex-start" : "center",
              padding: menuAberto ? "10px 12px" : "10px 0",
              borderRadius: 7,
              background: secao === id ? "rgba(255,255,255,0.15)" : "transparent",
              border: "none", color: secao === id ? "#fff" : "rgba(255,255,255,0.65)",
              cursor: "pointer", fontSize: 13, fontWeight: secao === id ? 600 : 400,
              textAlign: "left", width: "100%", marginBottom: 2, transition: "all 0.15s",
              borderLeft: menuAberto ? (secao === id ? "3px solid rgba(255,255,255,0.8)" : "3px solid transparent") : "none",
              whiteSpace: "nowrap", overflow: "hidden"
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              {menuAberto && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Filtros — apenas quando expandido */}
        {menuAberto && (
          <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em", marginBottom: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              FILTROS
            </div>

            {/* Busca */}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text" placeholder="Buscar CR, cliente…" value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 6, boxSizing: "border-box",
                  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: 12, outline: "none",
                }}
              />
            </div>

            {/* Mês */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>MÊS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {meses.map(m => (
                  <button key={m} onClick={() => setFiltroMes(toggle(m))}
                    style={{
                      padding: "3px 8px", borderRadius: 20, fontSize: 10, cursor: "pointer",
                      border: `1px solid ${filtroMes.includes(m) ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)"}`,
                      background: filtroMes.includes(m) ? "rgba(255,255,255,0.25)" : "transparent",
                      color: filtroMes.includes(m) ? "#fff" : "rgba(255,255,255,0.6)",
                      fontWeight: filtroMes.includes(m) ? 700 : 400, transition: "all 0.15s"
                    }}>{m}</button>
                ))}
              </div>
            </div>

            {/* Gerente */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>GERENTE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {gerentes.map(g => (
                  <button key={g} onClick={() => setFiltroGerente(toggle(g))}
                    style={{
                      padding: "3px 8px", borderRadius: 20, fontSize: 10, cursor: "pointer",
                      border: `1px solid ${filtroGerente.includes(g) ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)"}`,
                      background: filtroGerente.includes(g) ? "rgba(255,255,255,0.25)" : "transparent",
                      color: filtroGerente.includes(g) ? "#fff" : "rgba(255,255,255,0.6)",
                      fontWeight: filtroGerente.includes(g) ? 700 : 400, transition: "all 0.15s"
                    }}>{g}</button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>STATUS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {STATUS_OPTS.map(s => (
                  <button key={s} onClick={() => setFiltroStatus(toggle(s))}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", textAlign: "left",
                      border: `1px solid ${filtroStatus.includes(s) ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)"}`,
                      background: filtroStatus.includes(s) ? "rgba(255,255,255,0.18)" : "transparent",
                      color: STATUS_COR_SIDEBAR[s] || "rgba(255,255,255,0.6)",
                      fontWeight: filtroStatus.includes(s) ? 700 : 400, transition: "all 0.15s"
                    }}>{s}</button>
                ))}
              </div>
            </div>

            {/* Tipo */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>TIPO</div>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                style={{
                  width: "100%", padding: "5px 8px", borderRadius: 6, boxSizing: "border-box",
                  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: 12, outline: "none",
                }}>
                <option value="" style={{ color: C.cinzaEscuro }}>Todos os tipos</option>
                {TIPO_OPTS.map(t => <option key={t} value={t} style={{ color: C.cinzaEscuro }}>{t}</option>)}
              </select>
            </div>

            {/* Limpar */}
            {temFiltro && (
              <button onClick={() => { setBusca(""); setFiltroMes([]); setFiltroGerente([]); setFiltroStatus([]); setFiltroTipo(""); }}
                style={{
                  width: "100%", padding: "6px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.65)", fontSize: 11
                }}>
                ✕ Redefinir filtros
              </button>
            )}
          </div>
        )}

        {/* Rodapé sidebar */}
        <div style={{ padding: menuAberto ? "10px 14px" : "10px 6px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <button onClick={carregarDados} title="Atualizar dados"
            style={{
              display: "flex", alignItems: "center", justifyContent: menuAberto ? "flex-start" : "center",
              gap: 8, padding: menuAberto ? "7px 12px" : "7px 0",
              borderRadius: 6, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500, width: "100%"
            }}>
            <span>↻</span>
            {menuAberto && <span>Atualizar dados</span>}
          </button>
          {menuAberto && lastUpdate && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 5, textAlign: "center" }}>
              Atualizado às {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          {menuAberto && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em" }}>desenvolvido por </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.02em" }}>Mariana Oliveira</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.borda}`, display: "flex", alignItems: "center", gap: 12, background: C.azul }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{secaoAtual?.label}</h1>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {loading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>⏳ Carregando…</span>}
            {erro && <span style={{ fontSize: 12, color: "#ffb3b3" }}>⚠ {erro}</span>}
            {!loading && !erro && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.12)", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>
                {dados.length} registros
              </span>
            )}
          </div>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflow: "hidden", padding: 16 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.cinzaClaro, gap: 10 }}>
              <span style={{ fontSize: 20 }}>⏳</span> Carregando dados da planilha…
            </div>
          ) : erro ? (
            <div style={{ textAlign: "center", marginTop: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
              <div style={{ color: C.vermelho, marginBottom: 12 }}>{erro}</div>
              <button onClick={carregarDados} style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${C.azul}`, background: C.azulClaro, color: C.azul, cursor: "pointer", fontWeight: 600 }}>Tentar novamente</button>
            </div>
          ) : secao === "gerencial" ? (
            <SecaoGerencial dados={dados} onUpdate={onUpdate} setToast={setToast} filtros={filtros} />
          ) : (
            <SecaoEconomico dados={dados} filtros={filtros} />
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
