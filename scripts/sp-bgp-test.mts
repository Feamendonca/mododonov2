import "dotenv/config";
import { getGraphToken, encodeShareUrl, downloadSpFile } from "../server/sharepoint";
import { extrairGruposPorMes, proporOrcamento } from "../server/orcamento-proposta";
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
  const grupos = extrairGruposPorMes(buf, item.name, undefined, 3);
  console.log("MESES LIDOS:", grupos.length);
  for (const m of grupos) console.log(`  ${m.anoMes}: receita=${m.cats.receitaBruta} cmv=${m.cats.cmv} folha=${m.cats.folha} | categorias=${Object.keys(m.cats).length}`);
  if (grupos.length) { const p = proporOrcamento(grupos); console.log("PROPOSTA → receita:", p.receitaBruta, "cmvPct:", p.cmvPct, "folha:", p.folha, "emAtencao:", p.emAtencao); }
} catch (e) { console.log("ERRO:", (e as Error).message); }
