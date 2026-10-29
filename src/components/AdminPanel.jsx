import { useState, useEffect } from "react";

const API = (action) => `/api/auth?action=${action}`;

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ── Componente de troca de senha ───────────────────────────────────────────
function ChangePassword({ token, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== confirm) return setMsg({ ok: false, text: "As senhas não coincidem." });
    if (next.length < 6) return setMsg({ ok: false, text: "Mínimo 6 caracteres." });
    setLoading(true);
    try {
      const res = await fetch(API("change-password"), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ok: true, text: "Senha alterada com sucesso!" });
      setTimeout(onClose, 1500);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.modal}>
      <div style={styles.modalBox}>
        <h3 style={{ color: "#F0F7FF", margin: "0 0 20px" }}>Trocar Senha</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={styles.input} type="password" placeholder="Senha atual" value={current} onChange={e => setCurrent(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Nova senha (mín. 6 chars)" value={next} onChange={e => setNext(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Confirmar nova senha" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {msg && <p style={{ color: msg.ok ? "#6EE7B7" : "#FCA5A5", fontSize: 13, margin: 0 }}>{msg.text}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
            <button type="submit" disabled={loading} style={styles.btnPrimary}>{loading ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Formulário de usuário ──────────────────────────────────────────────────
function UserForm({ user, token, onSave, onClose }) {
  const isNew = !user;
  const [email, setEmail] = useState(user?.email || "");
  const [nome, setNome] = useState(user?.nome || "");
  const [perfil, setPerfil] = useState(user?.perfil || "viewer");
  const [ativo, setAtivo] = useState(user?.ativo || "Sim");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = { email, nome, perfil, ativo, isNew };
      if (isNew || password) body.password = password || undefined;
      const res = await fetch(API("save-user"), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSave();
    } catch (err) {
      setMsg(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={styles.modal}>
      <div style={styles.modalBox}>
        <h3 style={{ color: "#F0F7FF", margin: "0 0 20px" }}>{isNew ? "Novo Usuário" : "Editar Usuário"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={styles.input} type="email" placeholder="E-mail*" value={email} onChange={e => setEmail(e.target.value)} required disabled={!isNew} />
          <input style={styles.input} type="text" placeholder="Nome (opcional)" value={nome} onChange={e => setNome(e.target.value)} />
          <input
            style={styles.input}
            type="password"
            placeholder={isNew ? "Senha (padrão: GPS@2025)" : "Nova senha (vazio = manter)"}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <select style={{ ...styles.input, flex: 1 }} value={perfil} onChange={e => setPerfil(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <select style={{ ...styles.input, flex: 1 }} value={ativo} onChange={e => setAtivo(e.target.value)}>
              <option value="Sim">Ativo</option>
              <option value="Não">Inativo</option>
            </select>
          </div>
          {msg && <p style={{ color: "#FCA5A5", fontSize: 13, margin: 0 }}>{msg}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
            <button type="submit" disabled={loading} style={styles.btnPrimary}>{loading ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Painel principal ───────────────────────────────────────────────────────
export default function AdminPanel({ token, currentUser, onClose }) {
  const [tab, setTab] = useState("usuarios");
  const [users, setUsers] = useState([]);
  const [emails, setEmails] = useState([]);
  const [emailInput, setEmailInput] = useState("");
  const [editUser, setEditUser] = useState(null);   // null = fechado, {} = novo, obj = editar
  const [showNewUser, setShowNewUser] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { loadUsers(); loadEmails(); }, []);

  async function loadUsers() {
    try {
      const res = await fetch(API("list-users"), { headers: authHeaders(token) });
      const data = await res.json();
      setUsers(data.users || []);
    } catch {}
  }

  async function loadEmails() {
    try {
      const res = await fetch(API("get-emails"), { headers: authHeaders(token) });
      const data = await res.json();
      setEmails(data.emails || []);
    } catch {}
  }

  async function saveEmails() {
    setSaving(true);
    try {
      const res = await fetch(API("save-emails"), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ emails }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setMsg({ ok: true, text: "E-mails salvos!" });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function addEmail() {
    const e = emailInput.trim();
    if (e && !emails.includes(e)) {
      setEmails([...emails, e]);
      setEmailInput("");
    }
  }

  return (
    <div style={styles.overlay}>
      {showChangePwd && <ChangePassword token={token} onClose={() => setShowChangePwd(false)} />}
      {(showNewUser || editUser) && (
        <UserForm
          user={editUser || null}
          token={token}
          onSave={() => { setShowNewUser(false); setEditUser(null); loadUsers(); }}
          onClose={() => { setShowNewUser(false); setEditUser(null); }}
        />
      )}

      <div style={styles.panel}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ color: "#F0F7FF", margin: 0, fontSize: 20 }}>⚙️ Painel Admin</h2>
            <p style={{ color: "#4A6F85", margin: "4px 0 0", fontSize: 13 }}>Logado como {currentUser.email}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowChangePwd(true)} style={styles.btnSecondary}>Trocar senha</button>
            <button onClick={onClose} style={styles.btnSecondary}>✕ Fechar</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1E4060", paddingBottom: 1 }}>
          {["usuarios", "emails"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid #38BDF8" : "2px solid transparent",
                color: tab === t ? "#38BDF8" : "#4A6F85",
                fontSize: 14,
                fontWeight: 600,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              {t === "usuarios" ? "👥 Usuários" : "📧 E-mails do Relatório"}
            </button>
          ))}
        </div>

        {/* Tab: Usuários */}
        {tab === "usuarios" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => setShowNewUser(true)} style={styles.btnPrimary}>+ Novo usuário</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["E-mail", "Nome", "Perfil", "Status", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#7EC8E3", fontWeight: 600, padding: "8px 10px", borderBottom: "1px solid #1E4060" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.email} style={{ borderBottom: "1px solid #132F45" }}>
                    <td style={{ padding: "10px", color: "#F0F7FF" }}>{u.email}</td>
                    <td style={{ padding: "10px", color: "#7EC8E3" }}>{u.nome || "—"}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: u.perfil === "admin" ? "#1E3A4F" : "#1E2E45", color: u.perfil === "admin" ? "#38BDF8" : "#7EC8E3", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                        {u.perfil}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ color: u.ativo === "Sim" ? "#6EE7B7" : "#FCA5A5", fontSize: 12 }}>
                        {u.ativo === "Sim" ? "✓ Ativo" : "✗ Inativo"}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <button onClick={() => setEditUser(u)} style={{ ...styles.btnSecondary, padding: "4px 10px", fontSize: 12 }}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ color: "#4A6F85", padding: 20, textAlign: "center" }}>Nenhum usuário cadastrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: E-mails */}
        {tab === "emails" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ color: "#7EC8E3", fontSize: 14, margin: 0 }}>
              E-mails que recebem o relatório semanal automático (lidos pelo Apps Script da planilha).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="email"
                placeholder="adicionar@email.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addEmail())}
              />
              <button onClick={addEmail} style={styles.btnPrimary}>Adicionar</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {emails.map(e => (
                <div key={e} style={{ background: "#0B2E45", border: "1px solid #1E4060", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#F0F7FF", fontSize: 14 }}>📧 {e}</span>
                  <button
                    onClick={() => setEmails(emails.filter(x => x !== e))}
                    style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
              {emails.length === 0 && <p style={{ color: "#4A6F85", textAlign: "center", fontSize: 14 }}>Nenhum e-mail cadastrado</p>}
            </div>
            {msg && <p style={{ color: msg.ok ? "#6EE7B7" : "#FCA5A5", fontSize: 13, margin: 0 }}>{msg.text}</p>}
            <button onClick={saveEmails} disabled={saving} style={{ ...styles.btnPrimary, alignSelf: "flex-start" }}>
              {saving ? "Salvando…" : "💾 Salvar lista de e-mails"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Estilos compartilhados ─────────────────────────────────────────────────
const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    zIndex: 1000, overflowY: "auto", padding: "40px 16px",
  },
  panel: {
    background: "#0F2336", border: "1px solid #1E4060", borderRadius: 16,
    padding: 32, width: "100%", maxWidth: 700,
    fontFamily: "'Inter', 'DM Sans', Arial, sans-serif",
  },
  modal: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
  },
  modalBox: {
    background: "#0F2336", border: "1px solid #1E4060", borderRadius: 14,
    padding: "28px 32px", width: "100%", maxWidth: 420,
    fontFamily: "'Inter', 'DM Sans', Arial, sans-serif",
  },
  input: {
    background: "#0B2E45", border: "1px solid #1E4060", borderRadius: 8,
    padding: "10px 14px", color: "#F0F7FF", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box",
  },
  btnPrimary: {
    background: "#38BDF8", color: "#0B2E45", border: "none", borderRadius: 8,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
  btnSecondary: {
    background: "#132F45", color: "#7EC8E3", border: "1px solid #1E4060",
    borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer",
  },
};
