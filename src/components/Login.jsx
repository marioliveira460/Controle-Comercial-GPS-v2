import { useState } from "react";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div
      style={{
        minHeight: "100vh",
        background: "#0B2E45",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'DM Sans', Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#132F45",
          border: "1px solid #1E4060",
          borderRadius: 16,
          padding: "48px 40px",
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Logo / título */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(135deg,#38BDF8,#0B2E45)",
              borderRadius: 12,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            📊
          </div>
          <h1 style={{ color: "#F0F7FF", fontSize: 22, fontWeight: 700, margin: 0 }}>
            Dashboard Comercial
          </h1>
          <p style={{ color: "#4A6F85", fontSize: 14, margin: "6px 0 0" }}>Grupo GPS · Farmer</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ color: "#7EC8E3", fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              style={{
                width: "100%",
                background: "#0B2E45",
                border: "1px solid #1E4060",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#F0F7FF",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ color: "#7EC8E3", fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                background: "#0B2E45",
                border: "1px solid #1E4060",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#F0F7FF",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#3B1515",
                border: "1px solid #7F1D1D",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#FCA5A5",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "#1E4060" : "#38BDF8",
              color: loading ? "#4A6F85" : "#0B2E45",
              border: "none",
              borderRadius: 8,
              padding: "12px",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4,
              transition: "all 0.2s",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p style={{ color: "#2D5F7A", fontSize: 12, textAlign: "center", marginTop: 24 }}>
          Problemas para acessar? Fale com o administrador.
        </p>
      </div>
    </div>
  );
}
