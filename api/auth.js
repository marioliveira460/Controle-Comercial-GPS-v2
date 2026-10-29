// api/auth.js
// Vercel serverless function — autenticação de usuários via Google Sheets

import { google } from "googleapis";
import crypto from "crypto";

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";
const SESSION_SECRET = process.env.SESSION_SECRET || "gps-dashboard-secret-2025";

// Hash simples de senha com SHA-256
function hashPassword(password) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(password).digest("hex");
}

// Gera um token de sessão
function generateToken(email, perfil) {
  const payload = JSON.stringify({ email, perfil, exp: Date.now() + 8 * 60 * 60 * 1000 }); // 8h
  const token = Buffer.from(payload).toString("base64");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
  return `${token}.${sig}`;
}

// Valida um token de sessão
export function verifyToken(token) {
  try {
    const [payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, "base64").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { action } = req.query;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (action === "login") {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email e senha obrigatórios" });

    try {
      const sheets = await getSheets();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Usuarios!A2:E",
      });

      const rows = response.data.values || [];
      // Colunas: A=Email, B=SenhaHash, C=Perfil, D=Ativo, E=Nome
      const user = rows.find(
        (r) => r[0]?.toLowerCase() === email.toLowerCase() && r[3]?.toLowerCase() === "sim"
      );

      if (!user) return res.status(401).json({ error: "Usuário não encontrado ou inativo" });

      const inputHash = hashPassword(password);
      if (user[1] !== inputHash) return res.status(401).json({ error: "Senha incorreta" });

      const token = generateToken(user[0], user[2]);
      return res.status(200).json({
        token,
        user: { email: user[0], perfil: user[2], nome: user[4] || user[0] },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao autenticar" });
    }
  }

  // ── CRIAR / ATUALIZAR USUÁRIO (admin) ──────────────────────────────────────
  if (action === "save-user") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token obrigatório" });
    const session = verifyToken(authHeader.replace("Bearer ", ""));
    if (!session || session.perfil !== "admin") return res.status(403).json({ error: "Acesso negado" });

    const { email, password, perfil, ativo, nome, isNew } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });

    try {
      const sheets = await getSheets();

      if (isNew) {
        // Novo usuário
        const senhaHash = hashPassword(password || "GPS@2025");
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "Usuarios!A:E",
          valueInputOption: "RAW",
          requestBody: { values: [[email, senhaHash, perfil || "viewer", ativo || "Sim", nome || ""]] },
        });
      } else {
        // Atualizar usuário existente
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: "Usuarios!A2:E",
        });
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex((r) => r[0]?.toLowerCase() === email.toLowerCase());
        if (rowIndex === -1) return res.status(404).json({ error: "Usuário não encontrado" });

        const sheetRow = rowIndex + 2; // +2 por causa do header e índice 0
        const senhaHash = password ? hashPassword(password) : rows[rowIndex][1];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Usuarios!A${sheetRow}:E${sheetRow}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [[email, senhaHash, perfil || rows[rowIndex][2], ativo || rows[rowIndex][3], nome || rows[rowIndex][4]]],
          },
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao salvar usuário" });
    }
  }

  // ── LISTAR USUÁRIOS (admin) ────────────────────────────────────────────────
  if (action === "list-users") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token obrigatório" });
    const session = verifyToken(authHeader.replace("Bearer ", ""));
    if (!session || session.perfil !== "admin") return res.status(403).json({ error: "Acesso negado" });

    try {
      const sheets = await getSheets();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Usuarios!A2:E",
      });
      const rows = (response.data.values || []).map((r) => ({
        email: r[0],
        perfil: r[2],
        ativo: r[3],
        nome: r[4] || "",
      }));
      return res.status(200).json({ users: rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao listar usuários" });
    }
  }

  // ── CONFIG E-MAILS RELATÓRIO (admin) ──────────────────────────────────────
  if (action === "get-emails") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token obrigatório" });
    const session = verifyToken(authHeader.replace("Bearer ", ""));
    if (!session || session.perfil !== "admin") return res.status(403).json({ error: "Acesso negado" });

    try {
      const sheets = await getSheets();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "ConfigRelatorio!A2:A",
      });
      const emails = (response.data.values || []).map((r) => r[0]).filter(Boolean);
      return res.status(200).json({ emails });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao buscar e-mails" });
    }
  }

  if (action === "save-emails") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token obrigatório" });
    const session = verifyToken(authHeader.replace("Bearer ", ""));
    if (!session || session.perfil !== "admin") return res.status(403).json({ error: "Acesso negado" });

    const { emails } = req.body;
    if (!Array.isArray(emails)) return res.status(400).json({ error: "Lista de e-mails inválida" });

    try {
      const sheets = await getSheets();
      // Limpa e reescreve a aba
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: "ConfigRelatorio!A2:A",
      });
      if (emails.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: "ConfigRelatorio!A2",
          valueInputOption: "RAW",
          requestBody: { values: emails.map((e) => [e]) },
        });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao salvar e-mails" });
    }
  }

  // ── TROCAR SENHA (usuário logado) ─────────────────────────────────────────
  if (action === "change-password") {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Token obrigatório" });
    const session = verifyToken(authHeader.replace("Bearer ", ""));
    if (!session) return res.status(401).json({ error: "Sessão inválida" });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Senhas obrigatórias" });

    try {
      const sheets = await getSheets();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Usuarios!A2:E",
      });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((r) => r[0]?.toLowerCase() === session.email.toLowerCase());
      if (rowIndex === -1) return res.status(404).json({ error: "Usuário não encontrado" });

      if (rows[rowIndex][1] !== hashPassword(currentPassword))
        return res.status(401).json({ error: "Senha atual incorreta" });

      const sheetRow = rowIndex + 2;
      rows[rowIndex][1] = hashPassword(newPassword);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Usuarios!B${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [[hashPassword(newPassword)]] },
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao trocar senha" });
    }
  }

  return res.status(400).json({ error: "Ação inválida" });
}
