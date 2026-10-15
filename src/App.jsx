import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── Constantes ──────────────────────────────────────────────────────────────
const GID_GERENCIAL = "2073814116";
const SHEET_API = "/api/sheet";
const UPDATE_API = "/api/update-sheet";

const TIPO_OPTS = ["Reajuste", "DT", "Renovação", "Negócio Perdido", "Upselling", "Alteração de Escopo"];
const STATUS_OPTS = ["Em Negociação", "Em Negociação Antecipada", "Aguardando Reajuste", "Concluído", "Negócio Perdido", "Aprovado", "Pendente Cliente", "Pendente GPS"];

const C = {
  azul:        "#006080",
  azulMedio:   "#007fa3",
  azulClaro:   "#e6f4f8",
  cinzaEscuro: "#2d3748",
  cinzaMedio:  "#4a5568",
  cinzaClaro:  "#718096",
  borda:       "#d1dde3",
  bg:          "#ffffff",
  bgCard:      "#ffffff",
  verde:       "#0a8a5c",
  verdeClaro:  "#e6f7f1",
  vermelho:    "#c0392b",
  vermelhoClaro:"#fdf0ee",
  laranja:     "#c96b00",
  laranjaClaro:"#fef3e2",
  roxo:        "#6c3fb5",
  roxoClaro:   "#f0ebfb",
};

const SERIF = "'Georgia', 'Times New Roman', serif";

const TIPO_COR = {
  "Reajuste":            C.azul,
  "DT":                  C.roxo,
  "Renovação":           C.verde,
  "Negócio Perdido":     C.vermelho,
  "Upselling":           C.laranja,
  "Alteração de Escopo": C.azulMedio,
};
const TIPO_BG = {
  "Reajuste":            C.azulClaro,
  "DT":                  C.roxoClaro,
  "Renovação":           C.verdeClaro,
  "Negócio Perdido":     C.vermelhoClaro,
  "Upselling":           C.laranjaClaro,
  "Alteração de Escopo": C.azulClaro,
};

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
  const iIndice = idx("Índice Contratual");
  const iDataBase = idx("Data Base CCT");
  const iProdut = idx("Cláusula de Produtividade");
  const iSind = idx("Sindicato");

  return rows.filter(r => r && r[iCR]).map((r, i) => ({
    _idx: i + 1,
    mes: r[iMes] || "",
    mesVigencia: r[iMes] || "",
    grupoCliente: r[iGrupo] || "",
    cr: String(r[iCR] || "").trim(),
    descri: r[iDescri] || "",
    descricaoCR: r[iDescri] || "",
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
    indiceContratual: r[iIndice] || "",
    dataBaseCCT: r[iDataBase] || "",
    clausulaProdutividade: r[iProdut] ?? "",
    sindicato: r[iSind] || "",
  }));
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
const LogoInHaus = () => (
  <div style={{ textAlign: "center", lineHeight: 1 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
      <span style={{ fontWeight: 700, fontSize: 20, color: C.cinzaEscuro, letterSpacing: "-0.5px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>In</span>
      <span style={{ fontWeight: 700, fontSize: 20, color: C.azul, letterSpacing: "-0.5px", fontFamily: "'Segoe UI', Arial, sans-serif" }}>·Haus</span>
    </div>
    <div style={{ fontSize: 9, color: C.cinzaClaro, letterSpacing: "0.22em", marginTop: 2, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
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

// ─── Painel de filtros (popover) ──────────────────────────────────────────────
const FiltrosPopover = ({ filtros, setFiltros, meses, gerentes, onLimpar }) => {
  const { filtroMes, filtroGerente, filtroStatus, filtroTipo, busca } = filtros;
  const toggle = (key, val) => setFiltros(f => {
    const s = new Set(f[key]); s.has(val) ? s.delete(val) : s.add(val);
    return { ...f, [key]: [...s] };
  });

  const labelStyle = { fontSize: 10, fontWeight: 700, color: C.cinzaClaro, letterSpacing: "0.08em", marginBottom: 6, display: "block" };
  const chipStyle = (ativo) => ({
    padding: "3px 9px", borderRadius: 20, fontSize: 11, cursor: "pointer",
    border: `1px solid ${ativo ? C.azul : C.borda}`,
    background: ativo ? C.azul : "#f8fafc",
    color: ativo ? "#fff" : C.cinzaMedio,
    fontWeight: ativo ? 600 : 400, transition: "all 0.12s",
    whiteSpace: "nowrap"
  });

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 16,
      padding: "4px 0"
    }}>
      {/* Busca */}
      <div>
        <span style={labelStyle}>BUSCA</span>
        <input
          type="text" placeholder="CR, cliente, descrição…"
          value={busca} onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
          style={{
            width: "100%", padding: "6px 10px", borderRadius: 6, boxSizing: "border-box",
            border: `1px solid ${C.borda}`, background: "#f8fafc",
            color: C.cinzaEscuro, fontSize: 12, outline: "none"
          }}
        />
      </div>

      {/* Mês */}
      <div>
        <span style={labelStyle}>MÊS</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {meses.map(m => (
            <button key={m} onClick={() => toggle("filtroMes", m)} style={chipStyle(filtroMes.includes(m))}>{m}</button>
          ))}
        </div>
      </div>

      {/* Gerente */}
      <div>
        <span style={labelStyle}>GERENTE REGIONAL</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {gerentes.map(g => (
            <button key={g} onClick={() => toggle("filtroGerente", g)} style={chipStyle(filtroGerente.includes(g))}>{g}</button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <span style={labelStyle}>STATUS</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {STATUS_OPTS.map(s => {
            const cor = STATUS_COR[s];
            const ativo = filtroStatus.includes(s);
            return (
              <button key={s} onClick={() => toggle("filtroStatus", s)} style={{
                padding: "3px 9px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                border: `1px solid ${ativo ? (cor?.color || C.azul) : C.borda}`,
                background: ativo ? (cor?.bg || C.azulClaro) : "#f8fafc",
                color: ativo ? (cor?.color || C.azul) : C.cinzaMedio,
                fontWeight: ativo ? 700 : 400, transition: "all 0.12s"
              }}>{s}</button>
            );
          })}
        </div>
      </div>

      {/* Tipo */}
      <div>
        <span style={labelStyle}>TIPO DE NEGÓCIO</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {["Todos", ...TIPO_OPTS].map(t => {
            const ativo = t === "Todos" ? !filtroTipo : filtroTipo === t;
            return (
              <button key={t} onClick={() => setFiltros(f => ({ ...f, filtroTipo: t === "Todos" ? "" : t }))}
                style={chipStyle(ativo)}>{t}</button>
            );
          })}
        </div>
      </div>

      {/* Limpar */}
      <button onClick={onLimpar} style={{
        padding: "7px", borderRadius: 6, border: `1px solid ${C.borda}`,
        background: "#f8fafc", color: C.cinzaMedio, fontSize: 12, cursor: "pointer", width: "100%"
      }}>✕ Limpar filtros</button>
    </div>
  );
};

// ─── KPI Card Total ───────────────────────────────────────────────────────────
const KpiCardTotal = ({ total, kpiStatus }) => {
  const linhas = [
    { key: "Concluído",               label: "Concluído" },
    { key: "Aprovado",                label: "Aprovado" },
    { key: "Pendente Cliente",        label: "Pendente Cliente" },
    { key: "Pendente GPS",            label: "Pendente GPS" },
    { key: "Em Negociação",           label: "Em Negociação" },
    { key: "Em Negociação Antecipada",label: "Em Neg. Antecipada" },
    { key: "Aguardando Reajuste",     label: "Aguardando Reajuste" },
    { key: "Negócio Perdido",         label: "Negócio Perdido" },
  ].filter(({ key }) => kpiStatus[key]);

  return (
    <div style={{
      background: C.bgCard, borderRadius: 10, padding: "16px 20px",
      border: `1px solid ${C.borda}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      borderTop: `3px solid ${C.azul}`, gridColumn: "span 2"
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, borderBottom: `1px solid ${C.borda}`, paddingBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.cinzaClaro, fontWeight: 500 }}>Total de CRs</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: C.azul, lineHeight: 1 }}>{total}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {linhas.map(({ key, label }) => {
          const qtd = kpiStatus[key];
          const cor = STATUS_COR[key] || { color: C.cinzaMedio, bg: "#f5f5f5" };
          const pct = total > 0 ? Math.round((qtd / total) * 100) : 0;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: C.cinzaMedio }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: cor.color, minWidth: 20, textAlign: "right" }}>{qtd}</span>
              <span style={{ fontSize: 10, color: C.cinzaClaro, minWidth: 30, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── KPI Card simples ─────────────────────────────────────────────────────────
const KpiCard = ({ label, value, color }) => (
  <div style={{
    background: C.bgCard, borderRadius: 10, padding: "14px 18px",
    border: `1px solid ${C.borda}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    borderTop: `3px solid ${color || C.azul}`
  }}>
    <div style={{ fontSize: 11, color: C.cinzaClaro, marginBottom: 4, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || C.cinzaEscuro, lineHeight: 1 }}>{value}</div>
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

  const kpiStatus = useMemo(() => {
    const m = {};
    filtrado.forEach(d => {
      const st = d.status || statusTemporal(d) || "Sem Status";
      m[st] = (m[st] || 0) + 1;
    });
    return m;
  }, [filtrado]);

  // KPIs adicionais (excluindo os que já estão no card total)
  const kpiExtras = useMemo(() => {
    const ignorar = new Set(["Concluído","Aprovado","Pendente Cliente","Pendente GPS","Negócio Perdido"]);
    return Object.entries(kpiStatus)
      .filter(([st]) => !ignorar.has(st))
      .sort((a, b) => b[1] - a[1]);
  }, [kpiStatus]);

  const negociacoesCriticas = useMemo(() => {
    const hoje = new Date();
    const map = {};
    filtrado
      .filter(d => parseData(d.inicioNeg) && !parseData(d.dataAprov))
      .forEach(d => {
        const g = d.grupoCliente || "Sem Grupo";
        const dias = diasEntre(parseData(d.inicioNeg), hoje);
        if (!map[g] || dias > map[g].dias) map[g] = { grupoCliente: g, dias };
      });
    return Object.values(map).sort((a, b) => b.dias - a.dias).slice(0, 6);
  }, [filtrado]);

  const semaforo = (dias) => {
    if (dias >= 60) return { color: C.vermelho, bg: C.vermelhoClaro, label: "Crítico" };
    if (dias >= 30) return { color: C.laranja, bg: C.laranjaClaro, label: "Atenção" };
    return { color: C.verde, bg: C.verdeClaro, label: "Ok" };
  };

  const kpiTipo = useMemo(() => {
    const m = {};
    filtrado.forEach(d => {
      const t = d.tipo || "Sem Tipo";
      m[t] = (m[t] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtrado]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <KpiCardTotal total={filtrado.length} kpiStatus={kpiStatus} />
        {kpiExtras.map(([st, c]) => {
          const cor = STATUS_COR[st] || { color: C.cinzaMedio, bg: "#f0f0f0" };
          return <KpiCard key={st} label={st} value={c} color={cor.color} />;
        })}
        {/* Card tipos de negócio — MEIO */}
        {kpiTipo.length > 0 && (
          <div style={{
            background: C.bgCard, borderRadius: 10, padding: "16px 20px",
            border: `1px solid ${C.borda}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            borderTop: `3px solid ${C.cinzaMedio}`, gridColumn: "span 2"
          }}>
            <div style={{ fontSize: 12, color: C.cinzaClaro, fontWeight: 500, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.borda}` }}>
              Tipo de Negócio
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {kpiTipo.map(([tipo, qtd]) => {
                const cor = TIPO_COR[tipo] || C.cinzaMedio;
                const pct = filtrado.length > 0 ? Math.round((qtd / filtrado.length) * 100) : 0;
                return (
                  <div key={tipo} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: C.cinzaMedio }}>{tipo}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cor, minWidth: 20, textAlign: "right" }}>{qtd}</span>
                    <span style={{ fontSize: 10, color: C.cinzaClaro, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Card negociações críticas — DIREITA */}
        {negociacoesCriticas.length > 0 && (
          <div style={{
            background: C.bgCard, borderRadius: 10, padding: "16px 20px",
            border: `1px solid ${C.borda}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            borderTop: `3px solid ${C.vermelho}`, gridColumn: "span 2"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.borda}` }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="2.5" r="2" fill={C.vermelho}/><circle cx="7" cy="7" r="2" fill={C.laranja}/><circle cx="7" cy="11.5" r="2" fill={C.verde}/></svg>
              <span style={{ fontSize: 12, color: C.cinzaClaro, fontWeight: 500 }}>Negociações Críticas</span>
              <span style={{ fontSize: 10, color: C.cinzaClaro, marginLeft: "auto" }}>dias em aberto</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {negociacoesCriticas.map(({ grupoCliente, dias }) => {
                const s = semaforo(dias);
                return (
                  <div key={grupoCliente} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0, boxShadow: `0 0 0 3px ${s.bg}` }} />
                    <span style={{ flex: 1, fontSize: 12, color: C.cinzaEscuro, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{grupoCliente}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: s.color, minWidth: 28, textAlign: "right" }}>{dias}d</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.borda}` }}>
              {[{ label: "Crítico (≥60d)", color: C.vermelho }, { label: "Atenção (≥30d)", color: C.laranja }, { label: "Ok (<30d)", color: C.verde }].map(({ label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 10, color: C.cinzaClaro }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Tabela por grupo */}
      {grupos.map(([grupo, rows]) => {
        const aberto = expandido[grupo] !== false;
        const tiposGrupo = [...new Set(rows.map(r => r.tipo).filter(Boolean))];
        const statusGrupo = [...new Set(rows.map(r => r.status || statusTemporal(r)).filter(Boolean))];
        const temPerdido = statusGrupo.some(s => s?.includes("Perdido"));
        const temConcluido = statusGrupo.every(s => s?.includes("Concluído") || s?.includes("Aprovado"));

        return (
          <div key={grupo} style={{ background: C.bgCard, borderRadius: 10, border: `1px solid ${C.borda}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
              style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: aberto ? `1px solid ${C.borda}` : "none", userSelect: "none" }}>
              <span style={{ color: C.cinzaClaro, fontSize: 10 }}>{aberto ? "▼" : "▶"}</span>
              <span style={{ fontWeight: 700, color: C.cinzaEscuro, fontSize: 13 }}>{grupo}</span>
              <span style={{ fontSize: 11, color: C.cinzaClaro, fontWeight: 400 }}>{rows.length} contrato{rows.length !== 1 ? "s" : ""}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {Object.entries(
                  rows.reduce((acc, r) => {
                    const st = r.status || statusTemporal(r) || "Sem Status";
                    acc[st] = (acc[st] || 0) + 1;
                    return acc;
                  }, {})
                ).sort((a, b) => b[1] - a[1]).map(([st, qtd]) => {
                  const cor = STATUS_COR[st] || { color: C.cinzaMedio, bg: "#f0f0f0" };
                  return (
                    <span key={st} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 4,
                      background: cor.bg, border: `1px solid ${cor.color}30`,
                      fontSize: 11, color: cor.color, fontWeight: 600, whiteSpace: "nowrap"
                    }}>
                      {st} <span style={{ fontWeight: 800 }}>{qtd}</span>
                    </span>
                  );
                })}
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

// ─── Seção Visão do Cliente ──────────────────────────────────────────────────
// ─── Seção Matriz de Reajuste ────────────────────────────────────────────────
const SecaoMatriz = ({ dados }) => {
  const [busca, setBusca] = useState("");
  const [grupoAberto, setGrupoAberto] = useState({});

  const grupos = useMemo(() => {
    const map = {};
    dados.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = [];
      map[g].push(d);
    });
    return Object.entries(map)
      .map(([grupo, crs]) => ({ grupo, crs: crs.sort((a, b) => String(a.cr).localeCompare(String(b.cr))) }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo));
  }, [dados]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return grupos;
    const q = busca.toLowerCase();
    return grupos
      .map(({ grupo, crs }) => ({
        grupo,
        crs: crs.filter(d =>
          String(d.cr || "").toLowerCase().includes(q) ||
          String(d.descricaoCR || "").toLowerCase().includes(q) ||
          String(d.grupoCliente || "").toLowerCase().includes(q) ||
          String(d.indiceContratual || "").toLowerCase().includes(q) ||
          String(d.sindicato || "").toLowerCase().includes(q)
        )
      }))
      .filter(({ crs }) => crs.length > 0);
  }, [grupos, busca]);

  const toggleGrupo = (g) => setGrupoAberto(v => ({ ...v, [g]: !v[g] }));
  const todosAbertos = filtrados.every(({ grupo }) => grupoAberto[grupo] !== false);

  const thStyle = {
    padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.cinzaClaro,
    textAlign: "center", letterSpacing: "0.05em", borderBottom: `2px solid ${C.borda}`,
    background: "#f8fafb", whiteSpace: "nowrap",
  };
  const tdStyle = (align = "center") => ({
    padding: "9px 12px", fontSize: 13, color: C.cinzaMedio,
    borderBottom: `1px solid ${C.borda}`, textAlign: align, verticalAlign: "middle",
  });

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar cliente, CR, índice, sindicato…"
          style={{
            flex: 1, maxWidth: 400, padding: "8px 14px", borderRadius: 8,
            border: `1px solid ${C.borda}`, fontSize: 13, outline: "none",
            background: "#fff", color: C.cinzaEscuro,
          }}
        />
        <button
          onClick={() => {
            const next = !todosAbertos;
            const state = {};
            filtrados.forEach(({ grupo }) => { state[grupo] = next; });
            setGrupoAberto(state);
          }}
          style={{
            padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borda}`,
            background: "#fff", color: C.cinzaMedio, cursor: "pointer", fontSize: 12,
            fontFamily: SERIF,
          }}
        >
          {todosAbertos ? "Recolher todos" : "Expandir todos"}
        </button>
        <span style={{ fontSize: 12, color: C.cinzaClaro, marginLeft: "auto" }}>
          {filtrados.length} grupo{filtrados.length !== 1 ? "s" : ""} · {filtrados.reduce((s, g) => s + g.crs.length, 0)} CRs
        </span>
      </div>

      {/* Grupos */}
      {filtrados.map(({ grupo, crs }) => {
        const aberto = grupoAberto[grupo] !== false;
        // Unique index values for this group
        const indices = [...new Set(crs.map(d => d.indiceContratual).filter(Boolean))];
        return (
          <div key={grupo} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${C.borda}`, overflow: "hidden" }}>
            {/* Header do grupo */}
            <div
              onClick={() => toggleGrupo(grupo)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                cursor: "pointer", borderBottom: aberto ? `1px solid ${C.borda}` : "none",
                background: aberto ? C.azulClaro : "#f8fafb",
                transition: "background 0.15s",
              }}
            >
              <span style={{ fontSize: 13, color: C.azul, transition: "transform 0.15s", display: "inline-block", transform: aberto ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.cinzaEscuro, flex: 1 }}>{grupo}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {indices.slice(0, 3).map(idx => (
                  <span key={idx} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4,
                    background: C.azulClaro, color: C.azul, border: `1px solid ${C.azul}30`,
                    fontWeight: 600, whiteSpace: "nowrap",
                  }}>{idx}</span>
                ))}
              </div>
              <span style={{ fontSize: 12, color: C.cinzaClaro, marginLeft: 8, whiteSpace: "nowrap" }}>{crs.length} CR{crs.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Tabela */}
            {aberto && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: "center" }}>CR</th>
                      <th style={{ ...thStyle, textAlign: "left", minWidth: 240 }}>Descrição</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Mês Reajuste</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Índice Contratual</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Data Base CCT</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Cl. Produtividade</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Sindicato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crs.map((d, i) => (
                      <tr key={d.cr || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ ...tdStyle("center"), fontWeight: 700, color: C.azul, fontFamily: "monospace", fontSize: 12 }}>{d.cr}</td>
                        <td style={{ ...tdStyle("left"), color: C.cinzaEscuro, fontWeight: 500 }}>{d.descricaoCR || "—"}</td>
                        <td style={tdStyle("center")}>{d.mesVigencia || "—"}</td>
                        <td style={{ ...tdStyle("center"), fontWeight: 600, color: C.cinzaEscuro }}>{d.indiceContratual || "—"}</td>
                        <td style={tdStyle("center")}>{d.dataBaseCCT || "—"}</td>
                        <td style={{ ...tdStyle("center") }}>
                          {d.clausulaProdutividade && d.clausulaProdutividade !== "N/A" && String(d.clausulaProdutividade) !== "0" ? (
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 4,
                              background: C.verdeClaro, color: C.verde,
                              fontWeight: 600, fontSize: 12,
                            }}>
                              {pctFmt(d.clausulaProdutividade)}
                            </span>
                          ) : (
                            <span style={{ color: C.cinzaClaro, fontSize: 12 }}>N/A</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle("center"), fontSize: 12 }}>{d.sindicato || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {filtrados.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: C.cinzaClaro }}>
          Nenhum resultado para "{busca}"
        </div>
      )}
    </div>
  );
};

const SecaoClientes = ({ dados }) => {
  const [justificativas, setJustificativas] = useState({});
  const [editando, setEditando] = useState(null);
  const [textoEdit, setTextoEdit] = useState("");

  const hoje = new Date();

  const clientes = useMemo(() => {
    const map = {};
    dados.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = { grupo: g, crs: [] };
      map[g].crs.push(d);
    });

    return Object.values(map).map(({ grupo, crs }) => {
      const concluidos = crs.filter(d => parseData(d.dataAprov));
      const emAberto = crs.filter(d => parseData(d.inicioNeg) && !parseData(d.dataAprov));

      // Tempo médio dos concluídos
      const tempos = concluidos
        .map(d => diasEntre(parseData(d.inicioNeg), parseData(d.dataAprov)))
        .filter(v => v !== null && v >= 0);
      const mediaDias = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;

      // Maior tempo em aberto
      const maiorAberto = emAberto.length > 0
        ? Math.max(...emAberto.map(d => diasEntre(parseData(d.inicioNeg), hoje)).filter(v => v !== null))
        : null;

      // CRs individuais com tempo
      const detalhes = crs
        .filter(d => parseData(d.inicioNeg))
        .map(d => {
          const inicio = parseData(d.inicioNeg);
          const aprov = parseData(d.dataAprov);
          const dias = diasEntre(inicio, aprov || hoje);
          return { cr: d.cr, descri: d.descri, mes: d.mes, gerente: d.gerente, dias, concluido: !!aprov, status: d.status || statusTemporal(d) || "—" };
        })
        .sort((a, b) => b.dias - a.dias);

      // Semáforo do grupo baseado no maior tempo em aberto ou média
      const ref = maiorAberto ?? mediaDias ?? 0;
      const nivel = ref >= 60 ? "critico" : ref >= 30 ? "atencao" : "ok";

      return { grupo, crs: detalhes, total: crs.length, concluidos: concluidos.length, emAberto: emAberto.length, mediaDias, maiorAberto, nivel };
    }).sort((a, b) => {
      const ord = { critico: 0, atencao: 1, ok: 2 };
      return ord[a.nivel] - ord[b.nivel] || a.grupo.localeCompare(b.grupo);
    });
  }, [dados]);

  const semCor = { critico: { color: C.vermelho, bg: C.vermelhoClaro, label: "Crítico" }, atencao: { color: C.laranja, bg: C.laranjaClaro, label: "Atenção" }, ok: { color: C.verde, bg: C.verdeClaro, label: "Ok" } };
  const [expandido, setExpandido] = useState({});

  const salvarJust = (grupo) => {
    setJustificativas(j => ({ ...j, [grupo]: textoEdit }));
    setEditando(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Legenda */}
      <div style={{ display: "flex", gap: 16, padding: "10px 16px", background: "#fff", borderRadius: 8, border: `1px solid ${C.borda}`, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.cinzaClaro, fontWeight: 500 }}>Semáforo baseado no maior tempo em negociação aberta:</span>
        {[["critico","≥ 60 dias"],["atencao","30–59 dias"],["ok","< 30 dias"]].map(([n, l]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: semCor[n].color, boxShadow: `0 0 0 3px ${semCor[n].bg}` }} />
            <span style={{ fontSize: 11, color: C.cinzaMedio }}><b>{semCor[n].label}</b> {l}</span>
          </div>
        ))}
      </div>

      {/* Cards por cliente */}
      {clientes.map(({ grupo, crs, total, concluidos, emAberto, mediaDias, maiorAberto, nivel }) => {
        const s = semCor[nivel];
        const aberto = expandido[grupo] !== false;
        const just = justificativas[grupo] || "";

        return (
          <div key={grupo} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${C.borda}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", borderLeft: `4px solid ${s.color}` }}>
            {/* Cabeçalho */}
            <div onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
              style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
              {/* Semáforo */}
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color, flexShrink: 0, boxShadow: `0 0 0 4px ${s.bg}` }} />
              <span style={{ fontWeight: 700, color: C.cinzaEscuro, fontSize: 13, flex: 1 }}>{grupo}</span>
              {/* Stats rápidos */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.cinzaClaro }}>Total CRs</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.cinzaEscuro }}>{total}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.cinzaClaro }}>Concluídos</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.verde }}>{concluidos}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.cinzaClaro }}>Em aberto</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: emAberto > 0 ? s.color : C.cinzaMedio }}>{emAberto}</div>
                </div>
                {mediaDias !== null && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.cinzaClaro }}>Média concl.</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.cinzaMedio }}>{mediaDias}d</div>
                  </div>
                )}
                {maiorAberto !== null && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.cinzaClaro }}>Maior aberto</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{maiorAberto}d</div>
                  </div>
                )}
              </div>
              <span style={{ color: C.cinzaClaro, fontSize: 10, marginLeft: 8 }}>{aberto ? "▼" : "▶"}</span>
            </div>

            {aberto && (
              <div style={{ borderTop: `1px solid ${C.borda}` }}>
                {/* Justificativa */}
                <div style={{ padding: "10px 16px", background: "#fafbfc", borderBottom: `1px solid ${C.borda}` }}>
                  <div style={{ fontSize: 11, color: C.cinzaClaro, marginBottom: 4, fontWeight: 500 }}>Observação do cliente</div>
                  {editando === grupo ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        autoFocus value={textoEdit}
                        onChange={e => setTextoEdit(e.target.value)}
                        placeholder="Ex: Setor financeiro trata reajuste separado da diretoria operacional. Aprovações demoram pois passam por comitê..."
                        style={{ flex: 1, fontSize: 12, color: C.cinzaEscuro, padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.azul}`, resize: "vertical", minHeight: 60, outline: "none", fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button onClick={() => salvarJust(grupo)} style={{ padding: "5px 12px", borderRadius: 5, background: C.azul, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Salvar</button>
                        <button onClick={() => setEditando(null)} style={{ padding: "5px 12px", borderRadius: 5, background: "#f0f0f0", color: C.cinzaMedio, border: "none", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => { setEditando(grupo); setTextoEdit(just); }}
                      style={{ fontSize: 12, color: just ? C.cinzaEscuro : C.cinzaClaro, padding: "6px 10px", borderRadius: 6, border: `1px dashed ${C.borda}`, cursor: "pointer", minHeight: 32, background: "#fff", transition: "border-color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.azul}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.borda}>
                      {just || <span style={{ opacity: 0.5 }}>Clique para adicionar observação sobre esse cliente… ✏</span>}
                    </div>
                  )}
                </div>

                {/* Tabela de CRs */}
                {crs.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {[
                            { label: "CR",         align: "center" },
                            { label: "Descrição",  align: "left"   },
                            { label: "Status",     align: "center" },
                            { label: "Dias",       align: "center" },
                            { label: "Observação", align: "center" },
                          ].map(({ label, align }) => (
                            <th key={label} style={{ padding: "7px 12px", textAlign: align, color: C.cinzaClaro, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: `1px solid ${C.borda}` }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {crs.map((row, i) => {
                          const ds = row.dias >= 60 ? { color: C.vermelho } : row.dias >= 30 ? { color: C.laranja } : { color: C.verde };
                          const stCor = STATUS_COR[row.status] || { color: C.cinzaMedio, bg: "#f0f0f0" };
                          const obsKey = `${grupo}::${row.cr}`;
                          const obsVal = justificativas[obsKey] || "";
                          return (
                            <tr key={row.cr + i} style={{ borderBottom: `1px solid #f0f4f7`, background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                              <td style={{ padding: "7px 12px", color: C.cinzaMedio, fontFamily: "monospace", fontSize: 11, textAlign: "center" }}>{row.cr}</td>
                              <td style={{ padding: "7px 12px", color: C.cinzaEscuro, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descri}</td>
                              <td style={{ padding: "7px 12px", textAlign: "center" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, background: stCor.bg, color: stCor.color, fontSize: 11, fontWeight: 600 }}>{row.status}</span>
                              </td>
                              <td style={{ padding: "7px 12px", textAlign: "center" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: ds.color }}>{row.concluido ? "✓ " : ""}{row.dias}d</span>
                              </td>
                              <td style={{ padding: "7px 12px", textAlign: "center", minWidth: 180 }}>
                                {editando === obsKey ? (
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <input autoFocus value={textoEdit} onChange={e => setTextoEdit(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") { setJustificativas(j => ({ ...j, [obsKey]: textoEdit })); setEditando(null); } if (e.key === "Escape") setEditando(null); }}
                                      style={{ flex: 1, fontSize: 11, padding: "3px 7px", borderRadius: 4, border: `1.5px solid ${C.azul}`, outline: "none", fontFamily: "inherit" }} />
                                    <button onClick={() => { setJustificativas(j => ({ ...j, [obsKey]: textoEdit })); setEditando(null); }}
                                      style={{ padding: "3px 8px", borderRadius: 4, background: C.azul, color: "#fff", border: "none", fontSize: 11, cursor: "pointer" }}>✓</button>
                                  </div>
                                ) : (
                                  <div onClick={() => { setEditando(obsKey); setTextoEdit(obsVal); }}
                                    style={{ fontSize: 11, color: obsVal ? C.cinzaEscuro : C.borda, cursor: "pointer", padding: "2px 6px", borderRadius: 4, border: `1px dashed transparent`, transition: "all 0.12s", textAlign: "left" }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.azul; e.currentTarget.style.background = C.azulClaro; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}>
                                    {obsVal || "Adicionar observação…"}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Seção Controle Econômico ─────────────────────────────────────────────────
const SecaoEconomico = ({ dados, filtros }) => {
  const { filtroGerente, filtroMes, filtroTipo } = filtros;
  const [expandido, setExpandido] = useState({});

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <KpiCard label="Valor Total dos Contratos" value={brlFmt(totalAtual)} color={C.azul} />
        <KpiCard label="Valor Final / Pleito" value={brlFmt(totalFinal)} color={C.verde} />
        <KpiCard label="Ganho Estimado" value={brlFmt(totalGanho)} color={totalGanho >= 0 ? C.verde : C.vermelho} />
      </div>
      {grupos.map(([grupo, rows]) => {
        const gAtual = rows.reduce((s, d) => s + num(d.valorAtual), 0);
        const gFinal = rows.reduce((s, d) => s + num(d.valorFinal), 0);
        const gGanho = gFinal - gAtual;
        const gPct = gAtual > 0 ? (gGanho / gAtual) * 100 : 0;
        const aberto = expandido[grupo] !== false;
        return (
          <div key={grupo} style={{ background: C.bgCard, borderRadius: 10, border: `1px solid ${C.borda}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
              style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: aberto ? `1px solid ${C.borda}` : "none", userSelect: "none" }}>
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
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const filtrosRef = useRef(null);

  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [filtros, setFiltros] = useState({
    busca: "", filtroMes: [], filtroGerente: [], filtroStatus: [], filtroTipo: ""
  });

  const temFiltro = filtros.busca || filtros.filtroMes.length || filtros.filtroGerente.length || filtros.filtroStatus.length || filtros.filtroTipo;

  const carregarDados = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const values = await fetchSheet(GID_GERENCIAL);
      setDados(parseGerencial(values));
      setLastUpdate(new Date());
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Fechar filtros ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target)) setFiltrosAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const limparFiltros = () => setFiltros({ busca: "", filtroMes: [], filtroGerente: [], filtroStatus: [], filtroTipo: "" });

  const SECOES = [
    { id: "gerencial", label: "Gestão de Reajuste",  icon: "📋" },
    { id: "economico", label: "Controle Econômico",  icon: "📈" },
    { id: "clientes",  label: "Visão do Cliente",    icon: "◉" },
    { id: "matriz",    label: "Matriz de Reajuste",  icon: null, svgIcon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <polyline points="7.5 9 8.5 10 10 8.5"/>
        <line x1="12" y1="9" x2="15" y2="9"/>
        <polyline points="7.5 12.5 8.5 13.5 10 12"/>
        <line x1="12" y1="12.5" x2="14" y2="12.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
        <path d="M18.5 15v1M18.5 21v1M15 18.5h1M21 18.5h1M16.1 16.1l.7.7M20.2 20.2l.7.7M16.1 20.9l.7-.7M20.2 16.8l.7-.7"/>
      </svg>
    )},
  ];
  const TITULO_HEADER = {
    "gerencial": "Gestão de Reajustes Contratuais",
    "economico": "Controle Econômico",
    "clientes":  "Visão do Cliente",
    "matriz":    "Matriz de Reajuste",
  };
  const secaoAtual = SECOES.find(s => s.id === secao);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f5f8fa", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div style={{
        width: menuAberto ? 220 : 56, flexShrink: 0, background: C.azul,
        display: "flex", flexDirection: "column",
        transition: "width 0.2s cubic-bezier(.4,0,.2,1)", overflow: "hidden"
      }}>
        {/* Logo + pin */}
        <div style={{
          position: "relative",
          padding: "16px 12px",
          borderBottom: `1px solid ${C.borda}`,
          background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 64
        }}>
          {menuAberto && <LogoInHaus />}
          <button
            onClick={() => setMenuAberto(v => !v)}
            title={menuAberto ? "Recolher" : "Expandir"}
            style={{
              position: menuAberto ? "absolute" : "static",
              right: menuAberto ? 10 : undefined,
              background: C.azulClaro, border: `1px solid ${C.borda}`,
              borderRadius: 6, color: C.azul, cursor: "pointer",
              width: 28, height: 28, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, transition: "background 0.15s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.azulClaro}
            onMouseLeave={e => e.currentTarget.style.background = C.azulClaro}
          >
            📌
          </button>
        </div>

        {/* Nav */}
        <nav style={{ padding: "10px 6px" }}>
          {SECOES.map(({ id, label, icon, svgIcon }) => (
            <button key={id} onClick={() => setSecao(id)} title={!menuAberto ? label : undefined} style={{
              display: "flex", alignItems: "center",
              gap: menuAberto ? 10 : 0,
              justifyContent: menuAberto ? "flex-start" : "center",
              padding: menuAberto ? "10px 12px" : "10px 0",
              borderRadius: 7, width: "100%", marginBottom: 2,
              background: secao === id
                ? "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.32) 100%)"
                : "transparent",
              boxShadow: secao === id
                ? "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.35), 0 3px 8px rgba(0,0,0,0.28)"
                : "none",
              border: secao === id ? "1px solid rgba(0,0,0,0.25)" : "1px solid transparent",
              color: secao === id ? "#fff" : "rgba(255,255,255,0.6)",
              cursor: "pointer", fontSize: 13, fontWeight: secao === id ? 600 : 300,
              fontFamily: SERIF, letterSpacing: "0.03em",
              transition: "all 0.15s", whiteSpace: "nowrap", overflow: "hidden",
              borderLeft: menuAberto ? (secao === id ? "3px solid rgba(255,255,255,0.7)" : "3px solid transparent") : "none",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{svgIcon || icon}</span>
              {menuAberto && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Rodapé */}
        <div style={{ padding: menuAberto ? "10px 12px" : "10px 6px", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <button onClick={carregarDados} title="Atualizar dados" style={{
            display: "flex", alignItems: "center", justifyContent: menuAberto ? "flex-start" : "center",
            gap: 8, padding: menuAberto ? "7px 12px" : "7px 0",
            borderRadius: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 300, fontFamily: SERIF, letterSpacing: "0.03em", width: "100%"
          }}>
            <span>↻</span>{menuAberto && <span>Atualizar dados</span>}
          </button>
          {menuAberto && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
              {lastUpdate ? (
                <>Última atualização: {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {dados.length} registros</>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.25)" }}>Aguardando dados…</span>
              )}
            </div>
          )}
          {menuAberto && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)" }}>desenvolvido por </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Mariana Oliveira</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Área principal ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{
          padding: "0 24px", height: 56, flexShrink: 0,
          borderBottom: `1px solid ${C.borda}`,
          display: "flex", alignItems: "center", gap: 16,
          background: C.azul
        }}>
          {/* Título centralizado */}
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: "#fff", flex: 1, textAlign: "center", letterSpacing: "0.01em", fontFamily: "'Palatino Linotype', 'Palatino', 'Book Antiqua', serif" }}>
            {TITULO_HEADER[secao]}
          </h1>

          {/* Ações direita */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {loading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>⏳ Carregando…</span>}
            {erro && <span style={{ fontSize: 12, color: "#ffb3b3" }}>⚠ {erro}</span>}

            {/* Botão filtros */}
            <div ref={filtrosRef} style={{ position: "relative" }}>
              <button
                onClick={() => setFiltrosAberto(v => !v)}
                title="Filtros"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  background: filtrosAberto ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.14)",
                  border: `1px solid ${temFiltro ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)"}`,
                  color: "#fff", fontSize: 12, fontWeight: 300, fontFamily: SERIF, letterSpacing: "0.04em", transition: "all 0.15s"
                }}
              >
                {/* Ícone parâmetros (sliders) */}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="1" y1="3" x2="13" y2="3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="4" cy="3" r="1.5" fill="white"/>
                  <line x1="1" y1="7" x2="13" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="9" cy="7" r="1.5" fill="white"/>
                  <line x1="1" y1="11" x2="13" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="5" cy="11" r="1.5" fill="white"/>
                </svg>
                <span>Filtros</span>
                {temFiltro && (
                  <span style={{
                    background: "#fff", color: C.azul, borderRadius: "50%",
                    width: 16, height: 16, fontSize: 10, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {[filtros.filtroMes.length, filtros.filtroGerente.length, filtros.filtroStatus.length, filtros.filtroTipo ? 1 : 0, filtros.busca ? 1 : 0].reduce((a, b) => a + b, 0)}
                  </span>
                )}
              </button>

              {/* Popover filtros */}
              {filtrosAberto && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1000,
                  background: "#fff", borderRadius: 12, width: 380,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.14)", border: `1px solid ${C.borda}`,
                  padding: "16px 18px", maxHeight: "80vh", overflowY: "auto"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.cinzaEscuro }}>Filtros</span>
                    <button onClick={() => setFiltrosAberto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.cinzaClaro, fontSize: 16 }}>×</button>
                  </div>
                  <FiltrosPopover
                    filtros={filtros} setFiltros={setFiltros}
                    meses={meses} gerentes={gerentes}
                    onLimpar={() => { limparFiltros(); setFiltrosAberto(false); }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Corpo — scroll aqui */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
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
          ) : secao === "economico" ? (
            <SecaoEconomico dados={dados} filtros={filtros} />
          ) : secao === "clientes" ? (
            <SecaoClientes dados={dados} />
          ) : (
            <SecaoMatriz dados={dados} />
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
