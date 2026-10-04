import React, { useState } from 'react';
import { Card, Button, Toggle } from '../../../components/ui';
import { useBackend } from '../../../services/backend/BackendProvider';
import { useToast } from '../../../components/ui/toast';
import { useAppStore } from '../../../stores/appStore';
import { Scissors, UploadCloud, FolderOpen } from 'lucide-react';

export function MediaTrimTab() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [durationSec] = useState(180);
  const [start, setStart] = useState(15);
  const [end, setEnd] = useState(75);
  const [precise, setPrecise] = useState(true);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    if (!selectedFile) return;
    await backend.enqueue({
      kind: 'file',
      path: selectedFile,
      options: { op: 'trim', startSec: start, endSec: end, precise },
    });
    showToast('Corte de mídia adicionado à fila!', 'success');
    setCurrentTab('queue');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-2xl border-border bg-card shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Scissors className="w-5 h-5 text-amber-400" />
            Cortar Trecho de Vídeo ou Áudio
          </h3>
          <p className="text-xs text-muted-foreground">
            Selecione o ponto exato de início e fim para extrair apenas a parte que você precisa
          </p>
        </div>

        {!selectedFile ? (
          <div className="p-8 border-2 border-dashed border-border rounded-xl text-center space-y-3 bg-muted/20">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-amber-400 mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <input
                type="file"
                id="trim-file-input"
                className="hidden"
                accept="video/*,audio/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0].name);
                  }
                }}
              />
              <label
                htmlFor="trim-file-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-xl border border-border cursor-pointer transition-colors shadow-xs"
              >
                <FolderOpen className="w-4 h-4 text-amber-400" />
                Escolher Vídeo ou Áudio para Cortar
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border text-xs">
              <span className="font-semibold text-foreground truncate">{selectedFile}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Trocar Arquivo
              </button>
            </div>

            {/* Linha do Tempo e Sliders */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Início: <strong className="text-foreground">{formatTime(start)}</strong></span>
                <span>Fim: <strong className="text-foreground">{formatTime(end)}</strong></span>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={durationSec}
                  value={start}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val < end) setStart(val);
                  }}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <input
                  type="range"
                  min={0}
                  max={durationSec}
                  value={end}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > start) setEnd(val);
                  }}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="text-center text-xs text-muted-foreground">
                Duração do trecho: <strong className="text-foreground">{formatTime(end - start)}</strong>
              </div>
            </div>

            <Toggle
              checked={precise}
              onChange={setPrecise}
              label="Corte preciso quadro a quadro"
              description="Garante que o corte comece exatamente no frame selecionado."
            />

            <Button className="w-full h-11 rounded-xl shadow-sm text-sm" onClick={handleExport}>
              Exportar Trecho Cortado
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
