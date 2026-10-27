const { google } = require("googleapis");

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";
const TASKS_SHEET = "Tarefas";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const credRaw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!credRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT não configurado");

    const cred = JSON.parse(credRaw);
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Verifica se a aba existe
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const abaExiste = meta.data.sheets.some(s => s.properties.title === TASKS_SHEET);
    if (!abaExiste) return res.status(200).json({ tarefas: [] });

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TASKS_SHEET}!A:H`,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return res.status(200).json({ tarefas: [] });

    const [header, ...data] = rows;
    const idx = (col) => header.findIndex(h => h?.trim() === col);

    const tarefas = data
      .filter(r => r.some(c => c?.trim()))
      .map(r => ({
        id:          r[idx("ID")]           || "",
        cr:          r[idx("CR")]           || "",
        grupo:       r[idx("Grupo")]        || "",
        acao:        r[idx("Ação")]         || "",
        prazo:       r[idx("Prazo")]        || "",
        status:      r[idx("Status")]       || "A fazer",
        criadoEm:    r[idx("Criado em")]    || "",
        concluidoEm: r[idx("Concluído em")] || "",
      }));

    return res.status(200).json({ tarefas });
  } catch (e) {
    console.error("get-tasks error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
