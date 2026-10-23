import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Card } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { Puzzle, FolderOpen, CheckCircle2 } from 'lucide-react';

interface Setup { registered: boolean; extensionId: string; folderAvailable: boolean; error?: string }
export function ExtensionSettings() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const native = '__TAURI_INTERNALS__' in window;
  const { showToast } = useToast();
  const load = async () => { try { setSetup(await invoke<Setup>('extension_setup')); } catch { showToast('Não foi possível verificar a conexão da extensão.', 'error'); } };
  useEffect(() => { if (native) void load(); }, []);
  const connect = async () => {
    setBusy(true);
    try { await invoke('connect_extension'); await load(); showToast('Conexão com Chrome e Edge configurada.', 'success'); }
    catch (error) { showToast(String(error), 'error'); }
    finally { setBusy(false); }
  };
  return <Card className="space-y-4 mb-4">
    <h3 className="text-base font-semibold flex items-center gap-2"><Puzzle className="w-5 h-5 text-primary" /> Extensão CrowDash</h3>
    <p className="text-xs text-muted-foreground">Detecte vídeos e músicas no navegador e envie os downloads para este aplicativo.</p>
    {!native ? <p className="text-xs text-muted-foreground">A conexão com a extensão está disponível no aplicativo desktop.</p> : <>
      <p className={`text-xs ${setup?.registered ? 'text-success' : 'text-muted-foreground'}`}>{setup?.registered ? <><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Aplicativo registrado no navegador</> : setup?.error || 'Verificando conexão…'}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={connect} isLoading={busy}>Conectar extensão</Button>
        <Button size="sm" variant="outline" disabled={!setup?.folderAvailable} onClick={() => { void invoke('open_extension_folder').catch(error => showToast(String(error), 'error')); }}><FolderOpen className="w-4 h-4 mr-1.5" /> Abrir pasta da extensão</Button>
      </div>
      <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground">
        <li>Abra a pasta da extensão pelo botão acima.</li>
        <li>Em <code>chrome://extensions</code> ou <code>edge://extensions</code>, ative o modo do desenvolvedor e escolha “Carregar sem compactação”.</li>
        <li>Selecione essa pasta e fixe o CrowDash na barra do navegador.</li>
      </ol>
      <p className="text-[11px] text-muted-foreground">Depois de configurada, a extensão pode abrir o aplicativo ao enviar uma mídia.</p>
    </>}
  </Card>;
}
