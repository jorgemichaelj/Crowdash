import type { ErrorCode, UserFacingError } from './types';

export const ERROR_MESSAGES: Record<ErrorCode, Omit<UserFacingError, 'code' | 'technicalDetails'>> = {
  UNSUPPORTED_FORMAT: {
    title: 'Formato não suportado',
    message: 'O formato ou codec selecionado não é compatível com esta mídia.',
    retryable: false,
  },
  LOGIN_REQUIRED: {
    title: 'Sessão necessária',
    message: 'Este conteúdo exige login com sua conta no navegador para ser acessado.',
    retryable: true,
  },
  NETWORK: {
    title: 'Falha de conexão',
    message: 'Não foi possível conectar ao servidor da mídia. Verifique sua conexão com a internet.',
    retryable: true,
  },
  DISK_FULL: {
    title: 'Espaço em disco insuficiente',
    message: 'Não há espaço livre suficiente na unidade de destino para concluir a operação.',
    retryable: true,
  },
  MEDIA_UNAVAILABLE: {
    title: 'Mídia indisponível',
    message: 'O link da mídia expirou ou o arquivo não está mais acessível.',
    retryable: false,
  },
  ENCODER_FAILED: {
    title: 'Falha no processador de vídeo',
    message: 'Ocorreu um erro durante a conversão do vídeo.',
    retryable: true,
  },
  UNKNOWN: {
    title: 'Erro inesperado',
    message: 'Ocorreu um problema ao processar a tarefa. Tente novamente.',
    retryable: true,
  },
};

export function createUserFacingError(
  code: ErrorCode,
  technicalDetails?: string,
  overrides?: Partial<UserFacingError>
): UserFacingError {
  const base = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
  return {
    code,
    title: overrides?.title ?? base.title,
    message: overrides?.message ?? base.message,
    retryable: overrides?.retryable ?? base.retryable,
    technicalDetails,
  };
}
