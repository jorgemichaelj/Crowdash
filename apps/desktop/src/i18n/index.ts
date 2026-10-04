import { ptBR, type Translations } from './pt-BR';

export function useI18n(): { t: Translations } {
  return { t: ptBR };
}
