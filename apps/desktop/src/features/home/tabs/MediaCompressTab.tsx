import React, { useState } from 'react';
import { Card, Button, Input, Toggle } from '../../../components/ui';
import { useBackend, useBackendMode } from '../../../services/backend/BackendProvider';
import { localMediaFile, pickLocalMediaFiles } from '../../../services/files/localFiles';
import { useToast } from '../../../components/ui/toast';
import { useAppStore } from '../../../stores/appStore';
import { Minimize2, UploadCloud, FolderOpen, Share2 } from 'lucide-react';

export function MediaCompressTab() {
  const backend = useBackend();
  const native = useBackendMode() === 'native';
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [targetSizeMB, setTargetSizeMB] = useState(25);
  const [precise, setPrecise] = useState(true);
  const [compressing, setCompressing] = useState(false);

  const pickVideo = async () => {
    try { const [file] = await pickLocalMediaFiles(false, true); if (file) setSelectedFile(file.path); }
    catch { showToast('Não foi possível abrir o seletor de vídeos.', 'error'); }
  };

  const handleCompress = async () => {
    if (!selectedFile || !Number.isFinite(targetSizeMB) || targetSizeMB <= 0) return;
    setCompressing(true);
    try {
    await backend.enqueue({
      kind: 'file',
      path: selectedFile,
      name: localMediaFile(selectedFile).name,
      options: { op: 'compress', targetSizeMB, preciseSize: precise },
    });
    showToast(native ? `Compressão para ${targetSizeMB}MB adicionada à fila!` : 'Compressão simulada adicionada à fila. Nenhum arquivo será salvo.', native ? 'success' : 'info');
    setCurrentTab('queue');
    } catch { showToast('Não foi possível adicionar a compressão à fila.', 'error'); }
    finally { setCompressing(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-2xl border-border bg-card shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Minimize2 className="w-5 h-5 text-primary" />
            Comprimir Arquivo para Tamanho Específico
          </h3>
          <p className="text-xs text-muted-foreground">
            Reduza o tamanho de vídeos mantendo a melhor qualidade visual possível
          </p>
        </div>

        {!selectedFile ? (
          <div className="p-8 border-2 border-dashed border-border rounded-xl text-center space-y-3 bg-muted/20">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-primary mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              {native ? <Button variant="secondary" onClick={pickVideo} className="rounded-xl"><FolderOpen className="w-4 h-4 mr-2" /> Escolher Vídeo para Comprimir</Button> : <><input
                type="file"
                id="compress-file-input"
                className="hidden"
                accept="video/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0].name);
                  }
                }}
              />
              <label
                htmlFor="compress-file-input"
                className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-xl border border-border cursor-pointer transition-colors shadow-xs"
              >
                <FolderOpen className="w-4 h-4 text-primary" />
                Escolher Vídeo para Comprimir
              </label>
              </>}
            </div>
          </div>
        ) : (
          <div className="space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border text-xs">
              <span title={selectedFile} className="font-semibold text-foreground truncate">{localMediaFile(selectedFile).name}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Trocar Arquivo
              </button>
            </div>

            {/* Presets Rápidos de Envio */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground block">
                Tamanho desejado rápido:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant={targetSizeMB === 25 ? 'primary' : 'outline'}
                  onClick={() => setTargetSizeMB(25)}
                  className="rounded-xl text-xs"
                >
                  <Share2 className="w-3.5 h-3.5 mr-1" />
                  25 MB (Discord / Zap)
                </Button>
                <Button
                  size="sm"
                  variant={targetSizeMB === 16 ? 'primary' : 'outline'}
                  onClick={() => setTargetSizeMB(16)}
                  className="rounded-xl text-xs"
                >
                  16 MB (WhatsApp Antigo)
                </Button>
                <Button
                  size="sm"
                  variant={targetSizeMB === 50 ? 'primary' : 'outline'}
                  onClick={() => setTargetSizeMB(50)}
                  className="rounded-xl text-xs"
                >
                  50 MB (Telegram)
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground block">
                Ou digite o tamanho máximo exato (MB):
              </label>
              <Input
                type="number"
                min={1}
                value={targetSizeMB}
                onChange={(e) => setTargetSizeMB(Number(e.target.value))}
                className="w-full text-xs"
              />
            </div>

            <Toggle
              checked={precise}
              onChange={setPrecise}
              label="Compressão de alta precisão de tamanho"
              description="Ajusta o bitrate com rigor para não ultrapassar o limite."
            />

            <Button className="w-full h-11 rounded-xl shadow-sm text-sm" onClick={handleCompress} isLoading={compressing} disabled={!Number.isFinite(targetSizeMB) || targetSizeMB <= 0}>
              {native ? 'Comprimir arquivo' : 'Simular compressão'} para {targetSizeMB} MB
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
