import React, { useState } from 'react';
import { Button, Input, Toggle } from '../../components/ui';
import { useI18n } from '../../i18n';

export function CompressModalContent({
  originalSizeBytes = 35 * 1024 * 1024,
  durationSec = 180,
  onCompress,
  onCancel,
}: {
  originalSizeBytes?: number;
  durationSec?: number;
  onCompress: (targetSizeMB: number, preciseSize: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const originalSizeMB = Math.round(originalSizeBytes / (1024 * 1024));
  const [targetSize, setTargetSize] = useState(Math.max(5, Math.floor(originalSizeMB / 2)));
  const [precise, setPrecise] = useState(false);

  // Fórmula do mock: bitrate_total = (tamanho_alvo × 8) / duracao
  const totalBitrateKbps = durationSec > 0 ? (targetSize * 8 * 1024) / durationSec : 1000;

  let qualityEstimate = t.compress.qualityLevels.good;
  let qualityColor = 'text-emerald-400';

  if (totalBitrateKbps > 2500) {
    qualityEstimate = t.compress.qualityLevels.excellent;
    qualityColor = 'text-emerald-400';
  } else if (totalBitrateKbps > 1200) {
    qualityEstimate = t.compress.qualityLevels.good;
    qualityColor = 'text-sky-400';
  } else if (totalBitrateKbps > 600) {
    qualityEstimate = t.compress.qualityLevels.fair;
    qualityColor = 'text-amber-400';
  } else {
    qualityEstimate = t.compress.qualityLevels.poor;
    qualityColor = 'text-rose-400';
  }

  const isLargerThanOriginal = targetSize >= originalSizeMB;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">
          {t.compress.targetSize}
        </label>
        <Input
          type="number"
          min={1}
          value={targetSize}
          onChange={(e) => setTargetSize(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          {t.compress.originalSize}: {originalSizeMB} MB
        </p>
      </div>

      {isLargerThanOriginal && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded text-xs">
          {t.compress.alreadySmaller}
        </div>
      )}

      <div className="p-3 bg-muted/40 rounded border border-border flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{t.compress.estimatedQuality}:</span>
        <strong className={`font-semibold ${qualityColor}`}>{qualityEstimate}</strong>
      </div>

      <Toggle
        checked={precise}
        onChange={setPrecise}
        label={t.compress.preciseSize}
      />

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={targetSize <= 0 || isLargerThanOriginal}
          onClick={() => onCompress(targetSize, precise)}
        >
          {t.compress.submit}
        </Button>
      </div>
    </div>
  );
}
