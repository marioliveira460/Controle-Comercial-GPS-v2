const { google } = require("googleapis");

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";
const TASKS_SHEET = "Tarefas";

const SEQUENCIA = [
  { diasOffset: 0,  acao: "Enviar proposta por email" },
  { diasOffset: 7,  acao: "Follow-up por email" },
  { diasOffset: 14, acao: "Cobrar retorno via email" },
  { diasOffset: 21, acao: "Agendar reunião" },
  { diasOffset: 30, acao: "Envolver gestor de relacionamento" },
  { diasOffset: 45, acao: "Escalada — decisão final" },
];

const HEADER = ["ID", "CR", "Grupo", "Ação", "Prazo", "Status", "Criado em", "Concluído em"];

function addDias(date, dias) {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0];
}

function gerarId() {
  return `T${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { cr, grupo } = req.body || {};
  if (!cr || !grupo) return res.status(400).json({ error: "cr e grupo são obrigatórios" });

  try {
    const credRaw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!credRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT não configurado");

    const cred = JSON.parse(credRaw);
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Verifica se a aba Tarefas existe; se não, cria
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const abaExiste = meta.data.sheets.some(s => s.properties.title === TASKS_SHEET);

    if (!abaExiste) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TASKS_SHEET } } }],
        },
      });
      // Grava o header
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TASKS_SHEET}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [HEADER] },
      });
    }

    // Verifica se já existem tarefas para esse CR (evita duplicar)
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TASKS_SHEET}!A:C`,
    });
    const rows = existing.data.values || [];
    const jaTemTarefas = rows.slice(1).some(r => String(r[1] || "").trim() === String(cr).trim());
    if (jaTemTarefas) {
      return res.status(200).json({ ok: true, criadas: 0, mensagem: "Tarefas já existem para este CR" });
    }

    // Gera as 6 tarefas
    const hoje = new Date().toISOString().split("T")[0];
    const novasTarefas = SEQUENCIA.map(({ diasOffset, acao }) => [
      gerarId(),
      String(cr),
      grupo,
      acao,
      addDias(hoje, diasOffset),
      "A fazer",
      hoje,
      "",
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TASKS_SHEET}!A:H`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: novasTarefas },
    });

    return res.status(200).json({ ok: true, criadas: novasTarefas.length });
  } catch (e) {
    console.error("create-tasks error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
