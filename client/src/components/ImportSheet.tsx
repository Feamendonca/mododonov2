/**
 * ImportSheet.tsx
 * Componente reutilizável para importação de planilhas Excel.
 * Suporta: upload via drag-and-drop ou clique, pré-visualização linha a linha,
 * indicação de erros por linha, e botão de importação final.
 */

import { useRef, useState, useCallback } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ImportRow {
  rowIndex: number;
  errors: string[];
  [key: string]: unknown;
}

export interface ImportSheetProps<T extends ImportRow> {
  /** Título exibido no cabeçalho */
  title: string;
  /** Descrição das colunas esperadas */
  columnsDescription: string;
  /** Colunas a exibir na pré-visualização: { key, label } */
  previewColumns: { key: string; label: string; render?: (val: unknown) => string }[];
  /** Função chamada com o base64 do arquivo para parsear no backend */
  onParse: (base64: string) => Promise<{ rows: T[]; validCount: number; errorCount: number; sheetName: string }>;
  /** Função chamada com as linhas válidas para importar */
  onImport: (rows: T[]) => Promise<{ message: string }>;
  /** Função para baixar o template */
  onDownloadTemplate?: () => Promise<{ base64: string; filename: string }>;
  /** Texto do botão de importação */
  importButtonLabel?: string;
  /** Se true, mostra opção de substituir itens existentes */
  showReplaceOption?: boolean;
  replaceLabel?: string;
}

function downloadBase64(base64: string, filename: string) {
  const link = document.createElement("a");
  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  link.download = filename;
  link.click();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:...;base64,"
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImportSheet<T extends ImportRow>({
  title,
  columnsDescription,
  previewColumns,
  onParse,
  onImport,
  onDownloadTemplate,
  importButtonLabel = "Importar",
  showReplaceOption = false,
  replaceLabel = "Substituir itens existentes",
}: ImportSheetProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [parseResult, setParseResult] = useState<{
    rows: T[];
    validCount: number;
    errorCount: number;
    sheetName: string;
  } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError("Formato inválido. Use arquivos .xlsx, .xls ou .csv");
      return;
    }
    setFileName(file.name);
    setParseResult(null);
    setImportResult(null);
    setParseError(null);
    setIsParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await onParse(base64);
      setParseResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(`Erro ao ler a planilha: ${msg}`);
    } finally {
      setIsParsing(false);
    }
  }, [onParse]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    if (!parseResult) return;
    const validRows = parseResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      const result = await onImport(validRows);
      setImportResult(result.message);
      setParseResult(null);
      setFileName(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportResult(`Erro: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!onDownloadTemplate) return;
    setIsDownloadingTemplate(true);
    try {
      const { base64, filename } = await onDownloadTemplate();
      downloadBase64(base64, filename);
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const errorRows = parseResult?.rows.filter((r) => r.errors.length > 0) ?? [];
  const validRows = parseResult?.rows.filter((r) => r.errors.length === 0) ?? [];

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{columnsDescription}</p>
        </div>
        {onDownloadTemplate && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isDownloadingTemplate ? "Baixando..." : "Baixar template"}
          </Button>
        )}
      </div>

      {/* Zona de upload */}
      {!parseResult && !importResult && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {isParsing ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm">Lendo planilha...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className={cn("p-3 rounded-full", isDragging ? "bg-primary/10" : "bg-muted")}>
                <Upload className={cn("h-6 w-6", isDragging ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isDragging ? "Solte o arquivo aqui" : "Arraste ou clique para selecionar"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Formatos aceitos: .xlsx, .xls, .csv</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Erro de parse */}
      {parseError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Resultado do parse — pré-visualização */}
      {parseResult && (
        <div className="space-y-3">
          {/* Resumo */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{fileName}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{parseResult.rows.length} linhas</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setParseResult(null); setFileName(null); }}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {parseResult.validCount} válidas
            </Badge>
            {parseResult.errorCount > 0 && (
              <Badge variant="destructive" className="gap-1 cursor-pointer" onClick={() => setShowErrors(!showErrors)}>
                <AlertCircle className="h-3 w-3" />
                {parseResult.errorCount} com erro
                {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Badge>
            )}
          </div>

          {/* Erros detalhados */}
          {showErrors && errorRows.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-40 overflow-y-auto">
              {errorRows.map((row) => (
                <div key={row.rowIndex} className="text-xs text-destructive">
                  <span className="font-medium">Linha {row.rowIndex}:</span> {row.errors.join("; ")}
                </div>
              ))}
            </div>
          )}

          {/* Tabela de pré-visualização (primeiras 10 linhas válidas) */}
          {validRows.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {previewColumns.map((col) => (
                        <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validRows.slice(0, 10).map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-muted/30">
                        {previewColumns.map((col) => (
                          <td key={col.key} className="px-3 py-2 text-foreground">
                            {col.render
                              ? col.render(row[col.key])
                              : String(row[col.key] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validRows.length > 10 && (
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground text-center">
                  + {validRows.length - 10} linhas adicionais
                </div>
              )}
            </div>
          )}

          {/* Opção de substituir */}
          {showReplaceOption && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="rounded"
              />
              <span>{replaceLabel}</span>
            </label>
          )}

          {/* Botão de importação */}
          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={isImporting || validRows.length === 0}
              className="gap-2"
            >
              {isImporting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {importButtonLabel} ({validRows.length} itens)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setParseResult(null); setFileName(null); }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Resultado da importação */}
      {importResult && (
        <div className={cn(
          "flex items-start gap-2 p-3 rounded-lg text-sm",
          importResult.startsWith("Erro")
            ? "bg-destructive/10 text-destructive"
            : "bg-green-500/10 text-green-700 dark:text-green-400"
        )}>
          {importResult.startsWith("Erro")
            ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{importResult}</span>
        </div>
      )}
    </div>
  );
}
