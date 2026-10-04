import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Toggle } from '../../components/ui';
import { useBackend } from '../../services/backend/BackendProvider';
import { useToast } from '../../components/ui/toast';
import { useAppStore } from '../../stores/appStore';
import { useI18n } from '../../i18n';
import type { AppSettings, HardwareInfo } from '@crowdash/shared';
import { Folder, Cpu, Globe, Sliders, Info, Trash2, CheckCircle2 } from 'lucide-react';

export function SettingsView() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { theme, setTheme, setUpdateAvailable } = useAppStore();
  const { t } = useI18n();

  const [settings, setLocalSettings] = useState<AppSettings | null>(null);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [activeSection, setActiveSection] = useState<'general' | 'hardware' | 'browser' | 'advanced' | 'about'>('general');

  useEffect(() => {
    backend.getSettings().then(setLocalSettings);
    backend.getHardwareInfo().then(setHardwareInfo);
  }, [backend]);

  if (!settings) return null;

  const handleUpdate = async (patch: Partial<AppSettings>) => {
    const updated = await backend.updateSettings(patch);
    setLocalSettings(updated);
  };

  const handlePickFolder = async () => {
    const chosen = await backend.pickOutputFolder();
    if (chosen) {
      handleUpdate({ outputFolder: chosen });
      showToast('Pasta alterada com sucesso!', 'success');
    }
  };

  const handleRevokeDomain = (domainToRevoke: string) => {
    const nextSessions = settings.browserSessions.filter((s) => s.domain !== domainToRevoke);
    handleUpdate({ browserSessions: nextSessions });
    showToast(`Acesso revogado para ${domainToRevoke}`, 'info');
  };

  return (
    <div className="max-w-4xl mx-auto flex gap-6">
      {/* Navegação lateral de seções */}
      <div className="w-56 shrink-0 space-y-1">
        {[
          { id: 'general', label: t.settings.sections.general, icon: Folder },
          { id: 'hardware', label: t.settings.sections.hardware, icon: Cpu },
          { id: 'browser', label: t.settings.sections.browser, icon: Globe },
          { id: 'advanced', label: t.settings.sections.advanced, icon: Sliders },
          { id: 'about', label: t.settings.sections.about, icon: Info },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id as any)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md text-left transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da seção ativa */}
      <div className="flex-1">
        {activeSection === 'general' && (
          <Card className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">
              {t.settings.sections.general}
            </h3>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t.settings.general.outputFolder}
              </label>
              <div className="flex gap-2">
                <Input value={settings.outputFolder} readOnly className="flex-1 text-xs" />
                <Button size="sm" variant="secondary" onClick={handlePickFolder}>
                  {t.settings.general.changeFolder}
                </Button>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <label className="text-xs font-medium text-foreground block mb-1">
                {t.settings.general.theme}
              </label>
              <select
                className="w-full bg-card border border-border rounded px-3 py-1.5 text-xs text-foreground"
                value={theme}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setTheme(val);
                  handleUpdate({ theme: val });
                }}
              >
                <option value="dark">{t.settings.general.themes.dark}</option>
                <option value="light">{t.settings.general.themes.light}</option>
                <option value="system">{t.settings.general.themes.system}</option>
              </select>
            </div>

            <div className="pt-2 border-t border-border">
              <Toggle
                checked={settings.notifyOnComplete}
                onChange={(checked) => handleUpdate({ notifyOnComplete: checked })}
                label={t.settings.general.notifications}
              />
            </div>
          </Card>
        )}

        {activeSection === 'hardware' && (
          <Card className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">
              {t.settings.sections.hardware}
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">
                {t.settings.hardware.mode}
              </label>
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hardwareAcceleration"
                    checked={settings.hardwareAcceleration === 'auto'}
                    onChange={() => handleUpdate({ hardwareAcceleration: 'auto' })}
                  />
                  <span>{t.settings.hardware.auto}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hardwareAcceleration"
                    checked={settings.hardwareAcceleration === 'off'}
                    onChange={() => handleUpdate({ hardwareAcceleration: 'off' })}
                  />
                  <span>{t.settings.hardware.off}</span>
                </label>
              </div>
            </div>

            <div className="p-3 bg-muted/40 rounded border border-border text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                {hardwareInfo?.gpu !== 'none'
                  ? t.settings.hardware.detected
                  : t.settings.hardware.notDetected}
              </span>
            </div>
          </Card>
        )}

        {activeSection === 'browser' && (
          <Card className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">
              {t.settings.sections.browser}
            </h3>

            <p className="text-xs text-muted-foreground">
              {t.settings.browser.description}
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.settings.browser.grantedDomains}
              </h4>

              {settings.browserSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t.settings.browser.noDomains}
                </p>
              ) : (
                <div className="space-y-2">
                  {settings.browserSessions.map((session) => (
                    <div
                      key={session.domain}
                      className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/20 text-xs"
                    >
                      <div>
                        <strong className="text-foreground">{session.domain}</strong>
                        <span className="text-muted-foreground ml-2">
                          ({session.browser})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleRevokeDomain(session.domain)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {t.settings.browser.revoke}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {activeSection === 'advanced' && (
          <Card className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">
              {t.settings.sections.advanced}
            </h3>

            <Toggle
              checked={settings.advanced.showTechnicalLogs}
              onChange={(checked) =>
                handleUpdate({
                  advanced: { ...settings.advanced, showTechnicalLogs: checked },
                })
              }
              label={t.settings.advanced.showLogs}
            />

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t.settings.advanced.customArgs}
              </label>
              <Input
                placeholder="-c:v libx264 -preset fast"
                value={settings.advanced.customCodecArgs || ''}
                onChange={(e) =>
                  handleUpdate({
                    advanced: { ...settings.advanced, customCodecArgs: e.target.value },
                  })
                }
              />
            </div>

            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('crowdash_jobs');
                  showToast(t.settings.advanced.cacheCleared, 'success');
                }}
              >
                {t.settings.advanced.clearCache}
              </Button>
            </div>
          </Card>
        )}

        {activeSection === 'about' && (
          <Card className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">
              {t.settings.sections.about}
            </h3>

            <div className="text-xs space-y-2">
              <p>
                <strong>Crowdash Desktop</strong>
              </p>
              <p className="text-muted-foreground">
                {t.settings.about.version}: 0.1.0 (Frontend Prototype)
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const update = await backend.checkForUpdate();
                if (update) {
                  setUpdateAvailable(update);
                } else {
                  showToast(t.settings.about.upToDate, 'info');
                }
              }}
            >
              {t.settings.about.checkUpdates}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
