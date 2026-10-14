const { google } = require("googleapis");

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { gid } = req.query;
  if (!gid) return res.status(400).json({ error: "gid é obrigatório" });

  try {
    const credRaw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!credRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT não configurado");

    const cred = JSON.parse(credRaw);
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Descobre o nome da aba pelo GID
    const metaResp = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: "sheets(properties(sheetId,title))",
    });

    const sheetMeta = metaResp.data.sheets.find(
      s => String(s.properties.sheetId) === String(gid)
    );

    if (!sheetMeta) {
      return res.status(404).json({ error: `Aba com GID ${gid} não encontrada` });
    }

    const sheetName = sheetMeta.properties.title;

    // Lê os valores
    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
    });

    return res.status(200).json({ values: dataResp.data.values || [] });
  } catch (e) {
    console.error("sheet.js error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
