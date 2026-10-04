import React, { useState } from 'react';
import { Button, Toggle } from '../../components/ui';
import type { MediaCategory, OutputContainer } from '@crowdash/shared';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export function ConvertModalContent({
  currentContainer = 'mp4',
  category = 'video',
  canStreamCopy = false,
  onConvert,
  onCancel,
}: {
  currentContainer?: string;
  category?: MediaCategory;
  canStreamCopy?: boolean;
  onConvert: (targetFormat: OutputContainer, keepQuality: boolean) => void;
  onCancel: () => void;
}) {
  const videoFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'mp4', label: 'MP4', desc: 'Máxima compatibilidade universal (Windows, TVs, Web)' },
    { format: 'mkv', label: 'MKV', desc: 'Suporte a múltiplas faixas de áudio e legendas' },
    { format: 'mov', label: 'MOV (QuickTime)', desc: 'Ideal para edição e produtos Apple' },
    { format: 'webm', label: 'WebM', desc: 'Leve e otimizado para a internet' },
    { format: 'avi', label: 'AVI', desc: 'Compatibilidade com players clássicos' },
  ];

  const audioFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'mp3', label: 'MP3', desc: 'O padrão universal de áudio' },
    { format: 'wav', label: 'WAV', desc: 'Sem perdas (Lossless, qualidade pura de estúdio)' },
    { format: 'flac', label: 'FLAC', desc: 'Alta fidelidade compactada sem perda' },
    { format: 'm4a', label: 'M4A / AAC', desc: 'Alta clareza de áudio da Apple' },
    { format: 'ogg', label: 'OGG Vorbis', desc: 'Formato livre de alto desempenho' },
  ];

  const imageFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'png', label: 'PNG', desc: 'Alta qualidade com suporte a transparência' },
    { format: 'jpg', label: 'JPG / JPEG', desc: 'Compacto e universal para fotos' },
    { format: 'webp', label: 'WebP', desc: 'Formato moderno super leve para a web' },
    { format: 'ico', label: 'ICO (Ícone)', desc: 'Ícone de sistema para Windows/Web' },
  ];

  const availableList =
    category === 'image'
      ? imageFormats
      : category === 'audio'
      ? audioFormats
      : videoFormats;

  const [selectedFormat, setSelectedFormat] = useState<OutputContainer>(
    availableList[0]?.format || 'mp4'
  );
  const [keepOriginalQuality, setKeepOriginalQuality] = useState(true);

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
          Formato Atual detectado
        </span>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-muted rounded font-mono text-xs uppercase font-semibold text-foreground">
            .{currentContainer}
          </span>
          {canStreamCopy && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Remux direto disponível (instantâneo, sem perda de qualidade)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground block">
          Escolha o novo formato de destino:
        </label>
        <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
          {availableList.map((item) => {
            const isSelected = selectedFormat === item.format;
            return (
              <button
                key={item.format}
                type="button"
                onClick={() => setSelectedFormat(item.format)}
                className={`p-2.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border bg-card/60 hover:bg-muted/40 hover:border-muted-foreground'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-semibold text-foreground uppercase">
                      {item.label}
                    </strong>
                    {item.format === currentContainer && (
                      <span className="text-[10px] text-muted-foreground">(Atual)</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {item.desc}
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Toggle
        checked={keepOriginalQuality}
        onChange={setKeepOriginalQuality}
        label="Preservar qualidade original"
        description="Garante máxima fidelidade sem compressão desnecessária."
      />

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onConvert(selectedFormat, keepOriginalQuality)}
        >
          Converter para .{selectedFormat.toUpperCase()}
        </Button>
      </div>
    </div>
  );
}
