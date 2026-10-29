import { useState, useEffect } from "react";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700;800&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao entrar");
      localStorage.setItem("gps_token", data.token);
      localStorage.setItem("gps_user", JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: "'Nunito Sans', 'Myriad Pro', 'Segoe UI', Arial, sans-serif",
    }}>
      {/* ── LADO ESQUERDO (60%) ─────────────────────────────────────── */}
      <div style={{
        flex: "0 0 60%",
        background: "linear-gradient(160deg, #004F73 0%, #005F87 50%, #00415E 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "64px 72px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Detalhe decorativo de fundo */}
        <div style={{
          position: "absolute", top: -120, right: -120,
          width: 420, height: 420,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.04)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80,
          width: 320, height: 320,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.03)",
          pointerEvents: "none",
        }} />

        {/* Conteúdo principal */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Linha decorativa */}
          <div style={{
            width: 48, height: 4,
            background: "#38BDF8",
            borderRadius: 2,
            marginBottom: 36,
          }} />

          <h1 style={{
            color: "#FFFFFF",
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.15,
            margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}>
            Portal de Gestão<br />
            <span style={{ color: "#7DD3F0" }}>de Reajustes</span><br />
            Contratuais
          </h1>

          <p style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: "0 0 40px",
          }}>
            Governança&nbsp;&nbsp;•&nbsp;&nbsp;Controle&nbsp;&nbsp;•&nbsp;&nbsp;Resultado
          </p>

          {/* Divider */}
          <div style={{
            width: "100%", maxWidth: 400,
            height: 1,
            background: "rgba(255,255,255,0.12)",
            margin: "0 0 36px",
          }} />

          <p style={{
            color: "rgba(255,255,255,0.65)",
            fontSize: 16,
            lineHeight: 1.7,
            maxWidth: 440,
            margin: 0,
          }}>
            Centralizando negociações, vencimentos e resultados financeiros em uma única plataforma.
          </p>
        </div>

        {/* Rodapé esquerdo */}
        <div style={{
          position: "absolute", bottom: 36, left: 72,
          zIndex: 1,
        }}>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: 0 }}>
            In-Haus Logística · Plataforma de Gestão de Reajustes Contratuais e Inteligência Comercial
          </p>
        </div>
      </div>

      {/* ── LADO DIREITO (40%) ─────────────────────────────────────── */}
      <div style={{
        flex: "0 0 40%",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 48px",
        position: "relative",
      }}>
        {/* Logo In-Haus */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <img
            src="/logo-inhaus.jpeg"
            alt="In-Haus Logística"
            style={{
              height: 80,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        {/* Título do form */}
        <h2 style={{
          color: "#1A2E3B",
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 32px",
          textAlign: "center",
        }}>
          Acesso ao Sistema
        </h2>

        {/* Formulário */}
        <form
          onSubmit={handleSubmit}
          style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 18 }}
        >
          <div>
            <label style={{
              display: "block", marginBottom: 6,
              fontSize: 13, fontWeight: 600, color: "#374151",
            }}>
              Usuário
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "11px 14px",
                border: "1.5px solid #D1D5DB",
                borderRadius: 8,
                fontSize: 14, color: "#111827",
                outline: "none",
                background: "#F9FAFB",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#005F87"}
              onBlur={e => e.target.style.borderColor = "#D1D5DB"}
            />
          </div>

          <div>
            <label style={{
              display: "block", marginBottom: 6,
              fontSize: 13, fontWeight: 600, color: "#374151",
            }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "11px 14px",
                border: "1.5px solid #D1D5DB",
                borderRadius: 8,
                fontSize: 14, color: "#111827",
                outline: "none",
                background: "#F9FAFB",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#005F87"}
              onBlur={e => e.target.style.borderColor = "#D1D5DB"}
            />
          </div>

          {error && (
            <div style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#DC2626",
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              background: loading ? "#9CA3AF" : "#005F87",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4,
              letterSpacing: "0.02em",
              boxShadow: loading ? "none" : "0 4px 14px rgba(0,95,135,0.35)",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {/* Rodapé direito */}
        <p style={{
          position: "absolute", bottom: 28,
          color: "#9CA3AF", fontSize: 12, textAlign: "center",
        }}>
          Problemas para acessar? Fale com o administrador.
        </p>
      </div>
    </div>
  );
}
