import 'server-only';

// Gabarito mantido no servidor. Não importá-lo em componentes React cliente.
export const missionAnswerKey: Readonly<Record<string, string>> = Object.freeze({
  'm1-link-suspeito': 'verify',
  'm1-falso-comprovante': 'confirm',
  'm1-codigo-verificacao': 'refuse',
  'm1-perfil-falso': 'verify',
  'm1-promocao-fraudulenta': 'pause',
  'm2-perfil-falso': 'report',
  'm3-composicao': 'clear'
});
