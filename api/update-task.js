const { google } = require("googleapis");

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";
const TASKS_SHEET = "Tarefas";

const STATUS_VALIDOS = ["A fazer", "Aguardando resposta", "Em andamento", "Concluído"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id, status } = req.body || {};
  if (!id || !status) return res.status(400).json({ error: "id e status são obrigatórios" });
  if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: `Status inválido: ${status}` });

  try {
    const credRaw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!credRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT não configurado");

    const cred = JSON.parse(credRaw);
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Lê a aba inteira
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TASKS_SHEET}!A:H`,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) throw new Error("Aba Tarefas vazia");

    const header = rows[0];
    const idxId        = header.findIndex(h => h?.trim() === "ID");
    const idxStatus    = header.findIndex(h => h?.trim() === "Status");
    const idxConcluido = header.findIndex(h => h?.trim() === "Concluído em");

    // Encontra a linha pelo ID
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idxId] || "").trim() === String(id).trim()) {
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) throw new Error(`Tarefa ${id} não encontrada`);

    const linhaSheet = rowIdx + 1; // 1-based

    // Atualiza Status
    const colStatus = columnToLetter(idxStatus);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TASKS_SHEET}!${colStatus}${linhaSheet}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[status]] },
    });

    // Se concluído, preenche a data de conclusão
    if (status === "Concluído") {
      const colConcluido = columnToLetter(idxConcluido);
      const hoje = new Date().toISOString().split("T")[0];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TASKS_SHEET}!${colConcluido}${linhaSheet}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[hoje]] },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("update-task error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};

function columnToLetter(col) {
  let letter = "";
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}
