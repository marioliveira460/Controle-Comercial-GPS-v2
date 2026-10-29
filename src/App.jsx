import { useState, useEffect, useCallback } from "react";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";

// ── Semáforo ─────────────────────────────────────────────────────────────
function getSemaforo(dias) {
  if (dias <= 7) return { cor: "#10B981", label: "Verde", emoji: "🟢" };
  if (dias <= 21) return { cor: "#F59E0B", label: "Amarelo", emoji: "🟡" };
  return { cor: "#EF4444", label: "Vermelho", emoji: "🔴" };
}

// ── Card de tarefa ────────────────────────────────────────────────────────
function TarefaCard({ t }) {
  const sem = getSemaforo(t.dias);
  return (
    <div style={{
      background: "#132F45", border: `1px solid ${sem.cor}33`,
      borderLeft: `4px solid ${sem.cor}`, borderRadius: 10,
      padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: sem.cor }}>{sem.emoji} {sem.label}</span>
          <span style={{ fontSize: 13, color: "#4A6F85", marginLeft: 8 }}>{t.dias} dias</span>
        </div>
        <span style={{ fontSize: 12, color: "#4A6F85", background: "#0B2E45", borderRadius: 6, padding: "2px 8px" }}>{t.tipo}</span>
      </div>
      <p style={{ margin: "8px 0 2px", fontSize: 15, fontWeight: 700, color: "#F0F7FF" }}>{t.grupo}</p>
      <p style={{ margin: 0, fontSize: 13, color: "#7EC8E3" }}>CR {t.cr} · {t.etapa}</p>
      {t.acao && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#38BDF8" }}>→ {t.acao}</p>}
    </div>
  );
}

// ── Coluna do Kanban ──────────────────────────────────────────────────────
function Coluna({ titulo, tarefas, cor }) {
  return (
    <div style={{ flex: 1, minWidth: 260, background: "#0B2035", borderRadius: 12, padding: "16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: cor, display: "inline-block" }} />
        <span style={{ fontWeight: 700, color: "#F0F7FF", fontSize: 14 }}>{titulo}</span>
        <span style={{ marginLeft: "auto", background: "#132F45", color: "#4A6F85", borderRadius: 20, padding: "2px 10px", fontSize: 12 }}>{tarefas.length}</span>
      </div>
      {tarefas.map(t => <TarefaCard key={t.cr} t={t} />)}
      {tarefas.length === 0 && <p style={{ color: "#2D5F7A", fontSize: 13, textAlign: "center", margin: "24px 0" }}>Nenhum CR nesta etapa</p>}
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gps_user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("gps_token") || null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [ultimaAtt, setUltimaAtt] = useState(null);
  const [filtroSem, setFiltroSem] = useState("todos");

  function handleLogin(u, t) {
    setUser(u);
    setToken(t);
  }

  function handleLogout() {
    localStorage.removeItem("gps_token");
    localStorage.removeItem("gps_user");
    setUser(null);
    setToken(null);
  }

  const carregarTarefas = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/get-tasks");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTarefas(data.tarefas || []);
      setUltimaAtt(new Date().toLocaleString("pt-BR"));
    } catch (e) {
      setErro("Erro ao carregar tarefas: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) carregarTarefas();
  }, [user, carregarTarefas]);

  // ── Sem sessão → tela de login ─────────────────────────────────────────
  if (!user) return <Login onLogin={handleLogin} />;

  // ── Dados para o kanban ────────────────────────────────────────────────
  const ETAPAS = [
    { key: "Proposta",    label: "Proposta",    cor: "#38BDF8" },
    { key: "Negociação",  label: "Negociação",  cor: "#F59E0B" },
    { key: "Fechamento",  label: "Fechamento",  cor: "#10B981" },
    { key: "Pendente GPS",label: "Pendente GPS",cor: "#EF4444" },
  ];

  const filtradas = filtroSem === "todos"
    ? tarefas
    : tarefas.filter(t => {
        const d = t.dias;
        if (filtroSem === "verde")   return d <= 7;
        if (filtroSem === "amarelo") return d > 7 && d <= 21;
        if (filtroSem === "vermelho") return d > 21;
        return true;
      });

  const porEtapa = (etapa) => filtradas.filter(t => t.etapa === etapa);

  // ── Contagens p/ resumo ────────────────────────────────────────────────
  const verde    = tarefas.filter(t => t.dias <= 7).length;
  const amarelo  = tarefas.filter(t => t.dias > 7 && t.dias <= 21).length;
  const vermelho = tarefas.filter(t => t.dias > 21).length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#071B2C",
      fontFamily: "'Inter', 'DM Sans', Arial, sans-serif",
      color: "#F0F7FF",
    }}>
      {/* HEADER */}
      <header style={{
        background: "#0B2E45", borderBottom: "1px solid #1E4060",
        padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16,
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: "#38BDF8", letterSpacing: "-0.02em" }}>📊 Dashboard GPS</span>
        <span style={{ flex: 1 }} />
        {ultimaAtt && <span style={{ fontSize: 12, color: "#4A6F85" }}>Atualizado: {ultimaAtt}</span>}
        <button onClick={carregarTarefas} disabled={loading} style={{ background: "#132F45", border: "1px solid #1E4060", borderRadius: 8, color: "#7EC8E3", padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
          {loading ? "⟳" : "↻ Atualizar"}
        </button>
        {user.perfil === "admin" && (
          <button onClick={() => setShowAdmin(true)} style={{ background: "#132F45", border: "1px solid #1E4060", borderRadius: 8, color: "#7EC8E3", padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
            ⚙️ Admin
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#4A6F85" }}>{user.nome || user.email}</span>
          <button onClick={handleLogout} style={{ background: "none", border: "1px solid #1E4060", borderRadius: 8, color: "#4A6F85", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Sair
          </button>
        </div>
      </header>

      {/* ADMIN PANEL */}
      {showAdmin && <AdminPanel token={token} currentUser={user} onClose={() => setShowAdmin(false)} />}

      <main style={{ padding: "24px" }}>
        {/* RESUMO SEMÁFORO */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Total", val: tarefas.length, cor: "#38BDF8", key: "todos" },
            { label: "🟢 Verde (≤7d)", val: verde, cor: "#10B981", key: "verde" },
            { label: "🟡 Amarelo (8–21d)", val: amarelo, cor: "#F59E0B", key: "amarelo" },
            { label: "🔴 Vermelho (>21d)", val: vermelho, cor: "#EF4444", key: "vermelho" },
          ].map(c => (
            <button
              key={c.key}
              onClick={() => setFiltroSem(filtroSem === c.key ? "todos" : c.key)}
              style={{
                background: filtroSem === c.key ? `${c.cor}22` : "#0F2336",
                border: `1px solid ${filtroSem === c.key ? c.cor : "#1E4060"}`,
                borderRadius: 10, padding: "10px 20px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: c.cor }}>{c.val}</span>
              <span style={{ fontSize: 12, color: "#7EC8E3" }}>{c.label}</span>
            </button>
          ))}
        </div>

        {/* ERRO */}
        {erro && (
          <div style={{ background: "#3B1515", border: "1px solid #7F1D1D", borderRadius: 10, padding: "12px 16px", color: "#FCA5A5", marginBottom: 20 }}>
            {erro}
          </div>
        )}

        {/* KANBAN */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#4A6F85", padding: 60, fontSize: 15 }}>Carregando CRs…</div>
        ) : (
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 16 }}>
            {ETAPAS.map(e => (
              <Coluna key={e.key} titulo={e.label} tarefas={porEtapa(e.key)} cor={e.cor} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
