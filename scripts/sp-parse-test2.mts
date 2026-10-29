import "dotenv/config";
import { getGraphToken, encodeShareUrl, downloadSpFile } from "../server/sharepoint";
import { extrairGruposPorMes, proporOrcamento } from "../server/orcamento-proposta";
const fileUrl = "https://amfoods534.sharepoint.com/sites/AmFoods/Gesto/DRE´s/FRANQUEADORA/DRE AGROBAR FRANQUEADORA/DRE Agrobar Porto Alegre_Novo.xlsx";
try {
  const tok = await getGraphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(fileUrl)}/driveItem`, { headers: { Authorization: "Bearer " + tok } });
  const item: any = await r.json();
  const buf = await downloadSpFile({ name: item.name, lastModifiedDateTime: item.lastModifiedDateTime, downloadUrl: item["@microsoft.graph.downloadUrl"] });
  const grupos = extrairGruposPorMes(buf, item.name, undefined, 3);
  console.log("arquivo:", item.name, "| MESES LIDOS:", grupos.length);
  for (const m of grupos) console.log(`  ${m.anoMes}: receita=${m.cats.receitaBruta} cmv=${m.cats.cmv} folha=${m.cats.folha}`);
  const rasc = proporOrcamento(grupos);
  console.log("PROPOSTA → receitaBruta:", rasc.receitaBruta, "| cmvPct:", rasc.cmvPct, "| folha:", rasc.folha, "| emAtencao:", rasc.emAtencao);
} catch (e) { console.log("ERRO:", (e as Error).message); }
