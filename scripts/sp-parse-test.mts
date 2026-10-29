import "dotenv/config";
import { getGraphToken, encodeShareUrl, downloadSpFile } from "../server/sharepoint";
import { extrairGruposPorMes } from "../server/orcamento-proposta";

const fileUrl = "https://amfoods534.sharepoint.com/sites/AmFoods/Gesto/DRE´s/FRANQUEADORA/DRE CAFE CULTURA FRANQUEADORA/DRE 2025 Modelo Padrão - Franqueado (Café Cultura Av Paulista).xlsx";
try {
  const tok = await getGraphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(fileUrl)}/driveItem`, { headers: { Authorization: "Bearer " + tok } });
  const item: any = await r.json();
  const durl = item["@microsoft.graph.downloadUrl"];
  console.log("arquivo:", item.name, "| tem downloadUrl:", !!durl);
  const buf = await downloadSpFile({ name: item.name, lastModifiedDateTime: item.lastModifiedDateTime, downloadUrl: durl });
  console.log("baixado:", buf.length, "bytes");
  const grupos = extrairGruposPorMes(buf, item.name, undefined, 3);
  console.log("MESES LIDOS:", grupos.length);
  for (const m of grupos) {
    console.log(`  ${m.anoMes}: receita=${m.cats.receitaBruta} cmv=${m.cats.cmv} folha=${m.cats.folha} | total categorias=${Object.keys(m.cats).length}`);
  }
} catch (e) { console.log("ERRO:", (e as Error).message); }
