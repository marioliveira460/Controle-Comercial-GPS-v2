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
      range: `${TASKS_SHEET}!A:I`,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return res.status(200).json({ tarefas: [] });

    const [header, ...data] = rows;
    const idx = (col) => header.findIndex(h => h?.trim() === col);

    // Colunas da aba Tarefas gerada pelo syncTarefas.gs:
    // CR | Grupo Cliente | Status Real | Ação Atual | Etapa | Dias em Aberto | Inicio Negociação | Última Atualização | Tipo de Negócio
    const iCR         = idx("CR");
    const iGrupo      = idx("Grupo Cliente");
    const iStatusReal = idx("Status Real");
    const iAcao       = idx("Ação Atual");
    const iEtapa      = idx("Etapa");
    const iDias       = idx("Dias em Aberto");
    const iInicio     = idx("Inicio Negociação");
    const iUltAtt     = idx("Última Atualização");
    const iTipo       = idx("Tipo de Negócio");

    const tarefas = data
      .filter(r => r[iCR]?.trim())
      .map(r => ({
        cr:          r[iCR]         || "",
        grupo:       r[iGrupo]      || "",
        statusReal:  r[iStatusReal] || "",
        acao:        r[iAcao]       || "",
        etapa:       r[iEtapa]      || "",
        dias:        parseInt(r[iDias] || "0", 10) || 0,
        inicioNeg:   r[iInicio]     || "",
        ultimaAtt:   r[iUltAtt]     || "",
        tipo:        r[iTipo]       || "",
      }));

    return res.status(200).json({ tarefas });
  } catch (e) {
    console.error("get-tasks error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
