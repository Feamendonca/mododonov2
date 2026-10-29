import "dotenv/config";
import { getGraphToken, encodeShareUrl, downloadSpFile } from "../server/sharepoint";
import { extrairArvoreDre, proporLinhas } from "../server/orcamento-arvore";
import { calcularResumoLinhas } from "../server/orcamento-resumo";
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

  // ─── Validação ao vivo (Task L3): calcularResumoLinhas vs a linha
  // "RESULTADO OPERACIONAL / EBITDA" pronta na própria DRE ──────────────────
  const resumo = calcularResumoLinhas(linhas, 30);
  console.log("\n─── RESUMO (calcularResumoLinhas, pelas FOLHAS) ───");
  console.log("receitaBruta:", resumo.receitaBruta?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
  console.log("ebitda:      ", resumo.ebitda?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
  console.log("ebitdaPct:   ", resumo.ebitdaPct !== null ? (resumo.ebitdaPct * 100).toFixed(2) + "%" : "null");
  console.log("metaDiaria:  ", resumo.metaDiaria?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
  console.log("pontoEquilibrio:", resumo.pontoEquilibrio?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
  console.log("parcial:     ", resumo.parcial);

  const linhaEbitdaDre = linhas.find(l => /resultado\s+operacional|ebitda/i.test(l.label) && l.derivada);
  console.log("\n─── Comparação com a linha pronta da própria DRE ───");
  if (linhaEbitdaDre) {
    console.log(`Linha da DRE ("${linhaEbitdaDre.codigo} - ${linhaEbitdaDre.label}"):`, linhaEbitdaDre.histMedia?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
    console.log("ebitda calculado (folhas):                 ", resumo.ebitda?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "null");
    if (resumo.ebitda !== null && linhaEbitdaDre.histMedia !== null) {
      const diffAbs = resumo.ebitda - linhaEbitdaDre.histMedia;
      const diffPct = linhaEbitdaDre.histMedia !== 0 ? (diffAbs / linhaEbitdaDre.histMedia) * 100 : null;
      console.log("diferença:", diffAbs.toLocaleString("pt-BR", { minimumFractionDigits: 2 }), diffPct !== null ? `(${diffPct.toFixed(2)}%)` : "");
    }
  } else {
    console.log("Nenhuma linha derivada 'Resultado Operacional/EBITDA' encontrada na árvore.");
  }
} catch (e) { console.log("ERRO:", (e as Error).message); }
