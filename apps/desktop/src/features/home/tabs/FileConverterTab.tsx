import React, { useState } from 'react';
import { Card, Button, Toggle } from '../../../components/ui';
import { useBackend } from '../../../services/backend/BackendProvider';
import { useToast } from '../../../components/ui/toast';
import { useAppStore } from '../../../stores/appStore';
import type { MediaCategory, OutputContainer } from '@crowdash/shared';
import {
  UploadCloud,
  FolderOpen,
  Image as ImageIcon,
  Film,
  Music,
  CheckCircle2,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface SelectedFileItem {
  id: string;
  name: string;
  category: MediaCategory;
  ext: string;
}

export function FileConverterTab() {
  const backend = useBackend();
  const { showToast } = useToast();
  const { setCurrentTab } = useAppStore();

  const [filterCategory, setFilterCategory] = useState<MediaCategory>('image');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<OutputContainer>('png');
  const [keepQuality, setKeepOriginalQuality] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  const imageFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'png', label: 'PNG', desc: 'Alta qualidade com transparência (recomendado)' },
    { format: 'jpg', label: 'JPG / JPEG', desc: 'Leve e universal para fotos' },
    { format: 'webp', label: 'WebP', desc: 'Ultra leve e moderno para sites' },
    { format: 'ico', label: 'ICO', desc: 'Ícone de aplicativo para Windows/Web' },
  ];

  const videoFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'mp4', label: 'MP4', desc: 'Compatibilidade universal em qualquer aparelho' },
    { format: 'mkv', label: 'MKV', desc: 'Alta definição com suporte a legendas' },
    { format: 'mov', label: 'MOV', desc: 'Formato QuickTime para edição profissional' },
    { format: 'webm', label: 'WebM', desc: 'Otimizado para a internet' },
  ];

  const audioFormats: { format: OutputContainer; label: string; desc: string }[] = [
    { format: 'mp3', label: 'MP3', desc: 'Padrão mundial para qualquer player' },
    { format: 'wav', label: 'WAV', desc: 'Áudio puro sem compressão (estúdio)' },
    { format: 'flac', label: 'FLAC', desc: 'Sem perdas de alta fidelidade' },
    { format: 'm4a', label: 'M4A', desc: 'Áudio nítido de alta fidelidade' },
  ];

  const formatList =
    filterCategory === 'image'
      ? imageFormats
      : filterCategory === 'video'
      ? videoFormats
      : audioFormats;

  const handleFileSelection = (files: FileList | null) => {
    if (!files) return;
    const items: SelectedFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      let cat: MediaCategory = 'image';
      if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) cat = 'video';
      else if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) cat = 'audio';

      items.push({
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        category: cat,
        ext,
      });
    }

    setSelectedFiles((prev) => [...prev, ...items]);
    if (items[0]) {
      setFilterCategory(items[0].category);
      if (items[0].category === 'image') setTargetFormat('png');
      else if (items[0].category === 'video') setTargetFormat('mp4');
      else setTargetFormat('mp3');
    }
  };

  const handleConvertAll = async () => {
    if (selectedFiles.length === 0) return;

    for (const item of selectedFiles) {
      await backend.enqueue({
        kind: 'file',
        path: `C:\\Arquivos\\${item.name}`,
        name: item.name,
        options: {
          op: 'convert',
          container: targetFormat,
          category: item.category,
          keepQuality,
        },
      });
    }

    showToast(
      `${selectedFiles.length} arquivo(s) enviados para conversão em .${targetFormat.toUpperCase()}!`,
      'success'
    );
    setSelectedFiles([]);
    setCurrentTab('queue');
  };

  return (
    <div className="space-y-6">
      {/* Seletor de Categoria Superior */}
      <div className="flex gap-2 p-1.5 bg-muted/60 rounded-2xl border border-border">
        <button
          onClick={() => {
            setFilterCategory('image');
            setTargetFormat('png');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            filterCategory === 'image'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-emerald-400" />
          Converter Fotos / Imagens
        </button>

        <button
          onClick={() => {
            setFilterCategory('video');
            setTargetFormat('mp4');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            filterCategory === 'video'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Film className="w-4 h-4 text-sky-400" />
          Converter Vídeos
        </button>

        <button
          onClick={() => {
            setFilterCategory('audio');
            setTargetFormat('mp3');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            filterCategory === 'audio'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Music className="w-4 h-4 text-purple-400" />
          Converter Músicas / Áudios
        </button>
      </div>

      {/* DropZone Especializada para Arquivos */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFileSelection(e.dataTransfer.files);
        }}
        className={`relative rounded-2xl border-2 border-dashed p-8 transition-all text-center ${
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border bg-card/60 hover:border-primary/50'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-primary">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              Arraste suas {filterCategory === 'image' ? 'fotos (.webp, .png, .jpg)' : filterCategory === 'video' ? 'vídeos' : 'músicas'} para cá
            </h4>
            <p className="text-xs text-muted-foreground">
              Suporta múltiplos arquivos de uma só vez
            </p>
          </div>

          <div>
            <input
              type="file"
              id="converter-file-input"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelection(e.target.files)}
            />
            <label
              htmlFor="converter-file-input"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              <FolderOpen className="w-4 h-4" />
              Selecionar Arquivos no Computador
            </label>
          </div>
        </div>
      </div>

      {/* Lista de Arquivos Carregados & Opções de Conversão */}
      {selectedFiles.length > 0 && (
        <Card className="p-6 rounded-2xl border-border bg-card shadow-sm space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Arquivos Selecionados ({selectedFiles.length})
              </h4>
              <span className="text-xs text-muted-foreground">
                Todos serão convertidos para o formato escolhido abaixo
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedFiles([])}
              className="text-xs text-danger hover:bg-danger/10 border-danger/20"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Limpar Lista
            </Button>
          </div>

          {/* Lista de Arquivos */}
          <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
            {selectedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 rounded bg-muted font-mono uppercase text-[10px] font-semibold">
                    .{file.ext}
                  </span>
                  <span className="text-foreground truncate">{file.name}</span>
                </div>
                <button
                  onClick={() =>
                    setSelectedFiles((prev) => prev.filter((f) => f.id !== file.id))
                  }
                  className="text-muted-foreground hover:text-danger ml-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Escolha do Formato de Destino */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-xs font-semibold text-foreground block">
              Converter todos para:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {formatList.map((item) => {
                const isSelected = targetFormat === item.format;
                return (
                  <button
                    key={item.format}
                    type="button"
                    onClick={() => setTargetFormat(item.format)}
                    className={`p-3 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-card/60 hover:bg-muted/40 hover:border-muted-foreground'
                    }`}
                  >
                    <div>
                      <strong className="text-xs font-semibold text-foreground uppercase block">
                        .{item.label}
                      </strong>
                      <span className="text-[11px] text-muted-foreground mt-0.5 block leading-tight">
                        {item.desc}
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Toggle
            checked={keepQuality}
            onChange={setKeepOriginalQuality}
            label="Preservar qualidade original"
            description="Sem perdas de resolução ou compressão destrutiva."
          />

          <Button
            className="w-full h-11 rounded-xl shadow-sm text-sm"
            onClick={handleConvertAll}
          >
            Converter {selectedFiles.length} Arquivo(s) para .{targetFormat.toUpperCase()}
          </Button>
        </Card>
      )}
    </div>
  );
}
