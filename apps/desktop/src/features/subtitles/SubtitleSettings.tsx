import React from 'react';
import { Toggle } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { SubtitleOptions } from '@crowdash/shared';

export function SubtitleSettings({
  value,
  onChange,
}: {
  value: SubtitleOptions;
  onChange: (val: SubtitleOptions) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-3">
      <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t.subtitles.title}
      </h5>

      <Toggle
        checked={value.download}
        onChange={(checked) => onChange({ ...value, download: checked })}
        label={t.subtitles.download}
      />

      {value.download && (
        <div className="space-y-2 pt-2 border-t border-border">
          <Toggle
            checked={value.embed}
            onChange={(checked) => onChange({ ...value, embed: checked })}
            label={t.subtitles.embed}
          />

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">
                {t.subtitles.language}
              </label>
              <select
                className="w-full bg-card border border-border rounded px-2 py-1 text-foreground"
                value={value.language}
                onChange={(e) => onChange({ ...value, language: e.target.value })}
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">
                {t.subtitles.format}
              </label>
              <select
                className="w-full bg-card border border-border rounded px-2 py-1 text-foreground"
                value={value.format}
                onChange={(e) =>
                  onChange({ ...value, format: e.target.value as 'srt' | 'vtt' })
                }
              >
                <option value="srt">SRT</option>
                <option value="vtt">VTT</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
