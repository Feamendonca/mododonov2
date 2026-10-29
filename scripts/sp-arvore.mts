import "dotenv/config";
import { getGraphToken, encodeShareUrl, downloadSpFile } from "../server/sharepoint";
import { extrairArvoreDre, proporLinhas } from "../server/orcamento-arvore";
const url = "https://amfoods534.sharepoint.com/:x:/r/sites/AmFoods/_layouts/15/Doc.aspx?sourcedoc=%7B12014459-1D82-7898-A292-04DB6238E5CB%7D&file=DRE%20Ano26%20BGP%20(AZM).xlsb&action=default&mobileredirect=true&wdwpf=doclib-c";
try {
  const tok = await getGraphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(url)}/driveItem`, { headers: { Authorization: "Bearer " + tok } });
  console.log("resolve status:", r.status);
  const item: any = await r.json();
  if (!item["@microsoft.graph.downloadUrl"]) { console.log("sem downloadUrl. resposta:", JSON.stringify(item).slice(0,300)); process.exit(0); }
  console.log("arquivo:", item.name);
  const buf = await downloadSpFile({ name: item.name, lastModifiedDateTime: item.lastModifiedDateTime, downloadUrl: item["@microsoft.graph.downloadUrl"] });
  console.log("baixado:", buf.length, "bytes");

  const meses = extrairArvoreDre(buf, item.name, undefined, 3);
  console.log("MESES LIDOS:", meses.length, meses.map(m => m.anoMes).join(", "));

  if (meses.length === 0) { console.log("Nenhum mês extraído."); process.exit(0); }

  const linhas = proporLinhas(meses);
  console.log(`\nÁRVORE COMPLETA DA DRE — ${linhas.length} linhas\n`);
  console.log("codigo".padEnd(8), "label".padEnd(40), "nivel", "natureza".padEnd(10), "histMedia");
  console.log("-".repeat(100));
  for (const l of linhas) {
    const indent = l.nivel === 2 ? "  " : "";
    const valorFmt = l.histMedia !== null
      ? l.histMedia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "(sem dado)";
    console.log(
      (indent + l.codigo).padEnd(8),
      l.label.padEnd(40).slice(0, 40),
      String(l.nivel).padEnd(6),
      l.natureza.padEnd(10),
      valorFmt,
    );
  }
} catch (e) { console.log("ERRO:", (e as Error).message); }
