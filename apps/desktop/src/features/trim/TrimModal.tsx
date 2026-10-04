import React, { useState } from 'react';
import { Button, Toggle } from '../../components/ui';
import { useI18n } from '../../i18n';
import { Scissors } from 'lucide-react';

export function TrimModalContent({
  durationSec,
  onExport,
  onCancel,
}: {
  durationSec: number;
  onExport: (startSec: number, endSec: number, precise: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(durationSec || 60);
  const [precise, setPrecise] = useState(false);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartChange = (val: number) => {
    if (val < end) setStart(val);
  };

  const handleEndChange = (val: number) => {
    if (val > start && val <= durationSec) setEnd(val);
  };

  return (
    <div className="space-y-4">
      {/* Placeholder de Pré-visualização */}
      <div className="w-full h-40 bg-black/60 rounded-lg flex flex-col items-center justify-center border border-border text-muted-foreground">
        <Scissors className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-xs">Pré-visualização do corte</span>
        <span className="text-xs font-mono mt-1 text-primary">
          {formatTime(start)} — {formatTime(end)}
        </span>
      </div>

      {/* Linha do Tempo com 2 sliders */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>Início: {formatTime(start)}</span>
          <span>Fim: {formatTime(end)}</span>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={durationSec}
            value={start}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <input
            type="range"
            min={0}
            max={durationSec}
            value={end}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <div className="text-center text-xs text-muted-foreground">
          {t.trim.duration}: <strong className="text-foreground">{formatTime(end - start)}</strong>
        </div>
      </div>

      <Toggle
        checked={precise}
        onChange={setPrecise}
        label={t.trim.preciseTrim}
        description={t.trim.preciseNotice}
      />

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onExport(start, end, precise)}
        >
          {t.trim.export}
        </Button>
      </div>
    </div>
  );
}
