const { google } = require("googleapis");

const SPREADSHEET_ID = "1Mw46A8j0c5-6VyOY8K7bEFPTnEGLh6nG-lL5jEXe2G0";
const SHEET_NAME = "Gerencial";

// Mapeamento de campo → nome da coluna na planilha
const CAMPO_COLUNA = {
  "Tipo de Negócio": "Tipo de Negócio",
  "Status Real": "Status Real",
  "Devido (%)": "Devido (%)",
  "Aplicado (%)": "Aplicado (%)",
  "Valor Contrato Atual": "Valor Contrato Atual",
  "Valor Final/Pleito": "Valor Final/Pleito",
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { cr, campo, valor } = req.body || {};
  if (!cr || !campo) return res.status(400).json({ error: "cr e campo são obrigatórios" });

  const colunaAlvo = CAMPO_COLUNA[campo];
  if (!colunaAlvo) return res.status(400).json({ error: `Campo inválido: ${campo}` });

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
    const readResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}`,
    });

    const rows = readResp.data.values;
    if (!rows || rows.length < 2) throw new Error("Planilha vazia ou sem dados");

    const header = rows[0];
    const colCR = header.findIndex(h => h?.toString().trim().toLowerCase() === "cr");
    const colAlvo = header.findIndex(h => h?.toString().trim() === colunaAlvo);

    if (colCR === -1) throw new Error("Coluna CR não encontrada");
    if (colAlvo === -1) throw new Error(`Coluna "${colunaAlvo}" não encontrada`);

    // Encontra a linha pelo CR
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      const cellCR = String(rows[i][colCR] || "").trim();
      if (cellCR === String(cr).trim()) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx === -1) throw new Error(`CR ${cr} não encontrado na planilha`);

    // Converte para letra de coluna A1 notation
    const colLetra = columnToLetter(colAlvo);
    const linhaSheet = rowIdx + 1; // 1-based
    const range = `${SHEET_NAME}!${colLetra}${linhaSheet}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[valor]] },
    });

    return res.status(200).json({ ok: true, range, valor });
  } catch (e) {
    console.error("update-sheet error:", e.message);
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
