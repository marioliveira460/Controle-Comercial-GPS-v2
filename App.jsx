import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Constantes ──────────────────────────────────────────────────────────────
const GID_GERENCIAL = "2073814116";
const SHEET_API = "/api/sheet";
const UPDATE_API = "/api/update-sheet";

const TIPO_OPTS = ["Reajuste", "DT", "Renovação", "Negócio Perdido", "Upselling", "Alteração de Escopo"];
const STATUS_OPTS = ["Em Negociação", "Em Negociação Antecipada", "Aguardando Reajuste", "Concluído", "Negócio Perdido", "Aprovado", "Pendente Cliente"];

const TIPO_COR = {
  "Reajuste": "#3b82f6",
  "DT": "#8b5cf6",
  "Renovação": "#10b981",
  "Negócio Perdido": "#ef4444",
  "Upselling": "#f59e0b",
  "Alteração de Escopo": "#06b6d4",
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
    // Serial Excel
    const d = new Date(Math.round((s - 25569) * 86400 * 1000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const str = String(s).trim();
  // DD/MM/YYYY
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
  // ISO
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

  if (aprovacao) return null; // tem aprovação → usa status real
  if (inicio && dataVig && dataVig > hoje) return "Em Negociação Antecipada";
  if (inicio) return "Em Negociação";
  if (dataVig && dataVig > hoje) return "Aguardando Reajuste";
  return null;
};

// ─── Fetch planilha ──────────────────────────────────────────────────────────
const fetchSheet = async (gid) => {
  const r = await fetch(`${SHEET_API}?gid=${gid}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return json.values || [];
};

const parseGerencial = (values) => {
  if (!values || values.length < 2) return [];
  const [header, ...rows] = values;
  const idx = (name) => {
    const i = header.findIndex(h => h?.toString().trim().toLowerCase() === name.toLowerCase());
    return i;
  };
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
    _idx: i + 1, // linha 1-based no sheet (header é 0)
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

// ─── Componentes UI ──────────────────────────────────────────────────────────
const Toast = ({ msg, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "#10b981", color: "#fff", padding: "10px 20px",
      borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 16px #0005"
    }}>✓ {msg}</div>
  );
};

const Badge = ({ label, color = "#3b82f6" }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 12,
    background: color + "22", color: color, fontSize: 11, fontWeight: 600,
    border: `1px solid ${color}44`, whiteSpace: "nowrap"
  }}>{label}</span>
);

// ─── Edição inline de campo ───────────────────────────────────────────────────
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
        <select
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          autoFocus
          style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid #3b82f6", background: "#1e293b", color: "#f1f5f9" }}
        >
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    // pct input
    return (
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => e.key === "Enter" && save()}
        autoFocus
        style={{ width: 70, fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid #3b82f6", background: "#1e293b", color: "#f1f5f9", textAlign: "center" }}
      />
    );
  }

  return (
    <span
      style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
      onClick={() => { setVal(value); setEditing(true); }}
    >
      {value || "—"}
      <span style={{ opacity: 0.4, fontSize: 11 }}>✏️</span>
      {saving && <span style={{ fontSize: 10, color: "#94a3b8" }}>...</span>}
    </span>
  );
};

// ─── Seção Gerencial ─────────────────────────────────────────────────────────
const SecaoGerencial = ({ dados, gerentes, onUpdate, setToast }) => {
  const [busca, setBusca] = useState("");
  const [filtroMes, setFiltroMes] = useState([]);
  const [filtroGerente, setFiltroGerente] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expandido, setExpandido] = useState({});

  const toggle = (key, val) => (prev) => {
    const s = new Set(prev);
    s.has(val) ? s.delete(val) : s.add(val);
    return [...s];
  };

  const meses = useMemo(() => [...new Set(dados.map(d => d.mes).filter(Boolean))].sort((a, b) => mesNum(a) - mesNum(b)), [dados]);
  const tipos = useMemo(() => [...new Set(dados.map(d => d.tipo).filter(Boolean))].sort(), [dados]);

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

  // Agrupar por grupo cliente
  const grupos = useMemo(() => {
    const map = {};
    filtrado.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = [];
      map[g].push(d);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrado]);

  // Cards KPI
  const totalCRs = filtrado.length;
  const totalGrupos = grupos.length;
  const porTipo = useMemo(() => {
    const m = {};
    filtrado.forEach(d => { m[d.tipo] = (m[d.tipo] || 0) + 1; });
    return m;
  }, [filtrado]);

  const salvar = async (row, campo, valor) => {
    try {
      const body = { cr: row.cr, campo, valor };
      const r = await fetch(UPDATE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onUpdate(row.cr, campo, valor);
      setToast("Salvo na planilha");
    } catch (e) {
      setToast("Erro ao salvar: " + e.message);
    }
  };

  // Filtro lateral
  const MultiChip = ({ label, vals, options, onChange }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(toggle(label, o))}
            style={{
              padding: "3px 8px", borderRadius: 12, fontSize: 11, cursor: "pointer", border: "1px solid",
              background: vals.includes(o) ? "#3b82f6" : "transparent",
              borderColor: vals.includes(o) ? "#3b82f6" : "#334155",
              color: vals.includes(o) ? "#fff" : "#94a3b8"
            }}>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* Filtros laterais */}
      <div style={{ width: 200, flexShrink: 0, background: "#0f172a", borderRadius: 10, padding: 16, overflowY: "auto" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>Filtros</div>
        <input
          placeholder="Buscar CR, cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 12, marginBottom: 12, boxSizing: "border-box" }}
        />
        <MultiChip label="Mês" vals={filtroMes} options={meses} onChange={setFiltroMes} />
        <MultiChip label="Gerente" vals={filtroGerente} options={gerentes} onChange={setFiltroGerente} />
        <MultiChip label="Status" vals={filtroStatus} options={["Concluído","Em Negociação","Negócio Perdido","Aguardando","Aprovado","Pendente"]} onChange={setFiltroStatus} />
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Tipo</div>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 12 }}>
            <option value="">Todos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {(busca || filtroMes.length || filtroGerente.length || filtroStatus.length || filtroTipo) && (
          <button onClick={() => { setBusca(""); setFiltroMes([]); setFiltroGerente([]); setFiltroStatus([]); setFiltroTipo(""); }}
            style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
          <div style={{ background: "#0f172a", borderRadius: 8, padding: "12px 14px", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Total CRs</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>{totalCRs}</div>
          </div>
          <div style={{ background: "#0f172a", borderRadius: 8, padding: "12px 14px", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Grupos</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>{totalGrupos}</div>
          </div>
          {Object.entries(porTipo).map(([t, c]) => (
            <div key={t} style={{ background: "#0f172a", borderRadius: 8, padding: "12px 14px", border: `1px solid ${(TIPO_COR[t] || "#334155")}33` }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{t}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: TIPO_COR[t] || "#f1f5f9" }}>{c}</div>
            </div>
          ))}
        </div>

        {/* Tabela por grupo */}
        {grupos.map(([grupo, rows]) => (
          <div key={grupo} style={{ background: "#0f172a", borderRadius: 10, marginBottom: 10, border: "1px solid #1e293b", overflow: "hidden" }}>
            <div
              onClick={() => setExpandido(p => ({ ...p, [grupo]: !p[grupo] }))}
              style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: "#0f172a" }}
            >
              <span style={{ color: "#64748b", fontSize: 12 }}>{expandido[grupo] ? "▼" : "▶"}</span>
              <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>{grupo}</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>{rows.length} CR{rows.length !== 1 ? "s" : ""}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {[...new Set(rows.map(r => r.tipo).filter(Boolean))].map(t => (
                  <Badge key={t} label={t} color={TIPO_COR[t] || "#64748b"} />
                ))}
              </div>
            </div>
            {(expandido[grupo] !== false && expandido[grupo] !== undefined ? expandido[grupo] : true) && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1e293b" }}>
                      {["CR","Descrição","Mês","Gerente Regional","Devido %","Aplicado %","Tempo Neg.","Tipo","Status"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: "1px solid #334155" }}>{h}</th>
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
                      const statusExibir = row.status;

                      return (
                        <tr key={row.cr + i} style={{ borderBottom: "1px solid #1e293b", background: i % 2 === 0 ? "transparent" : "#080f1a" }}>
                          <td style={{ padding: "8px 10px", color: "#94a3b8", fontFamily: "monospace" }}>{row.cr}</td>
                          <td style={{ padding: "8px 10px", color: "#cbd5e1", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descri}</td>
                          <td style={{ padding: "8px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>{row.mes}</td>
                          <td style={{ padding: "8px 10px", color: "#e2e8f0", whiteSpace: "nowrap" }}>{row.gerente}</td>
                          {/* Devido % editável */}
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            <EditableCell
                              value={pctFmt(row.devido)}
                              type="text"
                              onSave={(v) => salvar(row, "Devido (%)", v)}
                            />
                          </td>
                          {/* Aplicado % editável */}
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            <EditableCell
                              value={pctFmt(row.aplicado)}
                              type="text"
                              onSave={(v) => salvar(row, "Aplicado (%)", v)}
                            />
                          </td>
                          {/* Tempo Neg. com status temporal */}
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            {stTemp ? (
                              <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 10,
                                background: stTemp.includes("Antecipada") ? "#312e8133" : "#0c4a6e33",
                                color: stTemp.includes("Antecipada") ? "#a78bfa" : "#38bdf8",
                                fontSize: 11, fontWeight: 600
                              }}>{stTemp}</span>
                            ) : dias !== null ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                                  background: concluido ? "#052e1633" : "#431a0333",
                                  color: concluido ? "#34d399" : "#fb923c"
                                }}>
                                  {concluido ? "✓" : "⏳"} {dias}d
                                </span>
                              </span>
                            ) : <span style={{ color: "#475569" }}>—</span>}
                          </td>
                          {/* Tipo editável */}
                          <td style={{ padding: "8px 10px" }}>
                            <EditableCell
                              value={row.tipo}
                              opts={TIPO_OPTS}
                              type="select"
                              onSave={(v) => salvar(row, "Tipo de Negócio", v)}
                            />
                          </td>
                          {/* Status editável */}
                          <td style={{ padding: "8px 10px" }}>
                            <EditableCell
                              value={statusExibir}
                              opts={STATUS_OPTS}
                              type="select"
                              onSave={(v) => salvar(row, "Status Real", v)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {grupos.length === 0 && (
          <div style={{ color: "#475569", textAlign: "center", marginTop: 40, fontSize: 14 }}>Nenhum registro encontrado</div>
        )}
      </div>
    </div>
  );
};

// ─── Seção Econômica ──────────────────────────────────────────────────────────
const SecaoEconomico = ({ dados, gerentes }) => {
  const [filtroGerente, setFiltroGerente] = useState([]);
  const [filtroMes, setFiltroMes] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expandido, setExpandido] = useState({});

  const meses = useMemo(() => [...new Set(dados.map(d => d.mes).filter(Boolean))].sort((a, b) => mesNum(a) - mesNum(b)), [dados]);
  const tipos = useMemo(() => [...new Set(dados.map(d => d.tipo).filter(Boolean))].sort(), [dados]);
  const toggle = (key, val) => (prev) => { const s = new Set(prev); s.has(val) ? s.delete(val) : s.add(val); return [...s]; };

  const filtrado = useMemo(() => dados.filter(d => {
    if (filtroMes.length && !filtroMes.includes(d.mes)) return false;
    if (filtroGerente.length && !filtroGerente.includes(d.gerente)) return false;
    if (filtroTipo && d.tipo !== filtroTipo) return false;
    // Só mostra quem tem algum valor preenchido
    return num(d.valorAtual) > 0 || num(d.valorFinal) > 0;
  }), [dados, filtroMes, filtroGerente, filtroTipo]);

  // Agrupar por Grupo Cliente
  const grupos = useMemo(() => {
    const map = {};
    filtrado.forEach(d => {
      const g = d.grupoCliente || "Sem Grupo";
      if (!map[g]) map[g] = [];
      map[g].push(d);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrado]);

  // KPIs globais
  const totalAtual = useMemo(() => filtrado.reduce((s, d) => s + num(d.valorAtual), 0), [filtrado]);
  const totalFinal = useMemo(() => filtrado.reduce((s, d) => s + num(d.valorFinal), 0), [filtrado]);
  const totalGanho = totalFinal - totalAtual;
  const pctGlobal = totalAtual > 0 ? (totalGanho / totalAtual) * 100 : 0;

  const MultiChip = ({ label, vals, options, onChange }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(toggle(label, o))}
            style={{
              padding: "3px 8px", borderRadius: 12, fontSize: 11, cursor: "pointer", border: "1px solid",
              background: vals.includes(o) ? "#10b981" : "transparent",
              borderColor: vals.includes(o) ? "#10b981" : "#334155",
              color: vals.includes(o) ? "#fff" : "#94a3b8"
            }}>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* Filtros */}
      <div style={{ width: 200, flexShrink: 0, background: "#0f172a", borderRadius: 10, padding: 16, overflowY: "auto" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>Filtros</div>
        <MultiChip label="Mês" vals={filtroMes} options={meses} onChange={setFiltroMes} />
        <MultiChip label="Gerente" vals={filtroGerente} options={gerentes} onChange={setFiltroGerente} />
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Tipo</div>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 12 }}>
            <option value="">Todos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {(filtroMes.length || filtroGerente.length || filtroTipo) && (
          <button onClick={() => { setFiltroMes([]); setFiltroGerente([]); setFiltroTipo(""); }}
            style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* KPIs globais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Valor Total Contrato", val: brlFmt(totalAtual), color: "#3b82f6" },
            { label: "Valor Final/Pleito", val: brlFmt(totalFinal), color: "#10b981" },
            { label: "Ganho Total", val: brlFmt(totalGanho), color: totalGanho >= 0 ? "#34d399" : "#ef4444" },
            { label: "% Médio Reajuste", val: `${pctGlobal.toFixed(2).replace(".", ",")}%`, color: "#f59e0b" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#0f172a", borderRadius: 8, padding: "14px 16px", border: `1px solid ${color}33` }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Cards por grupo */}
        {grupos.map(([grupo, rows]) => {
          const gAtual = rows.reduce((s, d) => s + num(d.valorAtual), 0);
          const gFinal = rows.reduce((s, d) => s + num(d.valorFinal), 0);
          const gGanho = gFinal - gAtual;
          const gPct = gAtual > 0 ? (gGanho / gAtual) * 100 : 0;
          const aberto = expandido[grupo] !== false;

          return (
            <div key={grupo} style={{ background: "#0f172a", borderRadius: 10, marginBottom: 10, border: "1px solid #1e293b", overflow: "hidden" }}>
              <div
                onClick={() => setExpandido(p => ({ ...p, [grupo]: !aberto }))}
                style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              >
                <span style={{ color: "#64748b", fontSize: 12 }}>{aberto ? "▼" : "▶"}</span>
                <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14, flex: 1 }}>{grupo}</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, textAlign: "right" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>Contrato Atual</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{brlFmt(gAtual)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>Valor Final</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{brlFmt(gFinal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>Ganho</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: gGanho >= 0 ? "#34d399" : "#ef4444" }}>{brlFmt(gGanho)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>% Reajuste</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{gPct.toFixed(2).replace(".", ",")}%</div>
                  </div>
                </div>
              </div>
              {aberto && (
                <div style={{ overflowX: "auto", borderTop: "1px solid #1e293b" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#0a1525" }}>
                        {["CR","Descrição","Mês","Gerente","Tipo","Contrato Atual","Valor Final","Ganho","% Reajuste"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: "1px solid #1e293b" }}>{h}</th>
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
                          <tr key={row.cr + i} style={{ borderBottom: "1px solid #0f172a", background: i % 2 === 0 ? "transparent" : "#080f1a" }}>
                            <td style={{ padding: "7px 10px", color: "#94a3b8", fontFamily: "monospace" }}>{row.cr}</td>
                            <td style={{ padding: "7px 10px", color: "#cbd5e1", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descri}</td>
                            <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{row.mes}</td>
                            <td style={{ padding: "7px 10px", color: "#e2e8f0" }}>{row.gerente}</td>
                            <td style={{ padding: "7px 10px" }}>
                              <Badge label={row.tipo || "—"} color={TIPO_COR[row.tipo] || "#64748b"} />
                            </td>
                            <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{brlFmt(vAtual)}</td>
                            <td style={{ padding: "7px 10px", color: "#10b981", fontWeight: 600 }}>{brlFmt(vFinal)}</td>
                            <td style={{ padding: "7px 10px", color: ganho >= 0 ? "#34d399" : "#ef4444", fontWeight: 600 }}>{brlFmt(ganho)}</td>
                            <td style={{ padding: "7px 10px", color: "#f59e0b", fontWeight: 700 }}>{pct.toFixed(2).replace(".", ",")}%</td>
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
          <div style={{ color: "#475569", textAlign: "center", marginTop: 40, fontSize: 14 }}>
            Nenhum registro com valores preenchidos encontrado
          </div>
        )}
      </div>
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

  // Gerentes únicos da planilha
  const gerentes = useMemo(() => [...new Set(dados.map(d => d.gerente).filter(Boolean))].sort(), [dados]);

  // Atualizar localmente após save
  const onUpdate = useCallback((cr, campo, valor) => {
    setDados(prev => prev.map(d => {
      if (d.cr !== cr) return d;
      const campoMap = {
        "Tipo de Negócio": "tipo",
        "Status Real": "status",
        "Devido (%)": "devido",
        "Aplicado (%)": "aplicado",
      };
      const key = campoMap[campo];
      return key ? { ...d, [key]: valor } : d;
    }));
  }, []);

  const MENU_W = menuAberto ? 220 : 52;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#020817", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" }}>
      {/* Menu lateral */}
      <div style={{
        width: MENU_W, flexShrink: 0, background: "#0f172a", borderRight: "1px solid #1e293b",
        display: "flex", flexDirection: "column", transition: "width 0.2s", overflow: "hidden"
      }}>
        {/* Header menu */}
        <div style={{ padding: "14px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e293b" }}>
          {menuAberto && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Grupo GPS</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Comercial</div>
            </div>
          )}
          <button onClick={() => setMenuAberto(p => !p)}
            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: 2, flexShrink: 0 }}>
            {menuAberto ? "◀" : "▶"}
          </button>
        </div>

        {/* Itens */}
        {[
          { id: "gerencial", icon: "📊", label: "Gerencial" },
          { id: "economico", icon: "💰", label: "Econômico" },
        ].map(({ id, icon, label }) => (
          <button key={id} onClick={() => setSecao(id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: secao === id ? "#1e293b" : "transparent",
              border: "none", borderLeft: secao === id ? "3px solid #3b82f6" : "3px solid transparent",
              color: secao === id ? "#f1f5f9" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: secao === id ? 600 : 400,
              textAlign: "left", width: "100%", whiteSpace: "nowrap", overflow: "hidden"
            }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
            {menuAberto && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
          </button>
        ))}

        {/* Rodapé menu */}
        <div style={{ marginTop: "auto", padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
          <button onClick={carregarDados}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6,
              background: "#1e293b", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, width: "100%"
            }}>
            <span style={{ flexShrink: 0 }}>🔄</span>
            {menuAberto && <span>Atualizar</span>}
          </button>
          {menuAberto && lastUpdate && (
            <div style={{ fontSize: 10, color: "#334155", marginTop: 4, textAlign: "center" }}>
              {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo principal */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 12, background: "#0f172a" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
              {secao === "gerencial" ? "Gerencial" : "Controle Econômico"}
            </h1>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {secao === "gerencial" ? "Reajustes e negociações por grupo cliente" : "Valores de contrato e ganhos por grupo cliente"}
            </div>
          </div>
          {loading && <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>⏳ Carregando...</span>}
          {erro && <span style={{ marginLeft: "auto", fontSize: 11, color: "#ef4444" }}>⚠ {erro}</span>}
          {!loading && !erro && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>{dados.length} registros</span>
          )}
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflow: "hidden", padding: 16 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>Carregando dados...</div>
          ) : erro ? (
            <div style={{ color: "#ef4444", textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div>{erro}</div>
              <button onClick={carregarDados} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Tentar novamente</button>
            </div>
          ) : secao === "gerencial" ? (
            <SecaoGerencial dados={dados} gerentes={gerentes} onUpdate={onUpdate} setToast={setToast} />
          ) : (
            <SecaoEconomico dados={dados} gerentes={gerentes} />
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
