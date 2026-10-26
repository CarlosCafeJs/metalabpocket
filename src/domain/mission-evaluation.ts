import type { Mission } from '@/domain/curriculum';

export const MAX_LOCAL_VIDEO_BYTES = 50 * 1024 * 1024;
export const LOCAL_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

export type MissionEvidence = {
  checks?: boolean[];
  choice?: string;
  text?: string;
  businessConfigured?: boolean;
  photoCount?: number;
  video?: {
    name: string;
    type: string;
    size: number;
  } | null;
};

export type CriterionResult = {
  id: string;
  label: string;
  met: boolean;
  guidance: string;
};

export type MissionEvaluation = {
  completed: boolean;
  status: 'complete' | 'try-again';
  title: string;
  message: string;
  criteria: CriterionResult[];
  nextStep: string;
  canRetry: boolean;
};

const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

export function containsPotentialSensitiveData(value: string) {
  const text = value.trim();
  return /https?:\/\/|www\./i.test(text)
    || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text)
    || /\b(?:\d[\s().-]*){8,}\b/.test(text)
    || /\b(?:senha|password|c[oó]digo(?:\s+de\s+verifica[cç][aã]o)?)\s*[:=-]\s*\S+/i.test(text);
}

function result(mission: Mission, criteria: CriterionResult[]): MissionEvaluation {
  const completed = criteria.length > 0 && criteria.every(criterion => criterion.met);
  const missing = criteria.filter(criterion => !criterion.met);

  return {
    completed,
    status: completed ? 'complete' : 'try-again',
    title: completed ? 'Missão concluída' : 'Continue experimentando',
    message: completed
      ? mission.feedback
      : missing[0]?.guidance || 'Revise os critérios e tente novamente no seu ritmo.',
    criteria,
    nextStep: completed
      ? 'Seu progresso pode ser registrado. Você pode repetir a atividade ou seguir para a próxima missão.'
      : 'Ajuste o que falta e envie outra tentativa. Errar faz parte da prática.',
    canRetry: true,
  };
}

export function evaluateMission(mission: Mission, evidence: MissionEvidence, authoritativeChoice?: boolean): MissionEvaluation {
  if (mission.kind === 'checklist') {
    const required = mission.requiredChecks ?? mission.instructions.length;
    const checked = (evidence.checks ?? []).filter(Boolean).length;
    return result(mission, [{
      id: 'required-checks',
      label: `Revisar ${required} etapa${required === 1 ? '' : 's'}`,
      met: checked >= required,
      guidance: `Você revisou ${checked} de ${required} etapas. Complete as restantes e tente novamente.`,
    }]);
  }

  if (mission.kind === 'choice') {
    const choice = normalize(evidence.choice);
    return result(mission, [{
      id: 'correct-choice',
      label: mission.criteria[0] || 'Escolher a ação adequada',
      met: choice.length > 0 && authoritativeChoice === true,
      guidance: choice
        ? 'Releia o cenário, procure os sinais de risco e escolha a ação mais segura.'
        : 'Escolha uma opção antes de conferir a resposta.',
    }]);
  }

  if (mission.kind === 'text') {
    const text = normalize(evidence.text);
    const minimum = mission.minLength ?? 30;
    return result(mission, [
      {
        id: 'minimum-length',
        label: `Escrever pelo menos ${minimum} caracteres`,
        met: text.length >= minimum,
        guidance: `Desenvolva um pouco mais sua resposta: faltam ${Math.max(0, minimum - text.length)} caracteres.`,
      },
      {
        id: 'safe-content',
        label: 'Manter dados pessoais, senhas e links fora da atividade',
        met: text.length > 0 && !containsPotentialSensitiveData(text),
        guidance: 'Remova links, e-mails, telefones, senhas ou códigos. Use somente informações fictícias do exercício.',
      },
    ]);
  }

  if (mission.kind === 'gallery') {
    const required = mission.requiredPhotos ?? 1;
    const count = Math.max(0, Number(evidence.photoCount) || 0);
    return result(mission, [{
      id: 'gallery-photos',
      label: `Ter ${required} foto${required === 1 ? '' : 's'} na Galeria`,
      met: count >= required,
      guidance: `A Galeria tem ${count} foto${count === 1 ? '' : 's'}. Abra a Câmera do celular e salve mais ${Math.max(0, required - count)}.`,
    }]);
  }

  if (mission.kind === 'video') {
    const video = evidence.video;
    const supportedType = Boolean(video && LOCAL_VIDEO_TYPES.includes(video.type as typeof LOCAL_VIDEO_TYPES[number]));
    const validSize = Boolean(video && video.size > 0 && video.size <= MAX_LOCAL_VIDEO_BYTES);
    return result(mission, [
      {
        id: 'video-type',
        label: 'Usar um vídeo MP4 ou WebM',
        met: supportedType,
        guidance: 'Escolha um arquivo de vídeo MP4 ou WebM.',
      },
      {
        id: 'video-size',
        label: 'Manter o arquivo em até 50 MB',
        met: validSize,
        guidance: video && video.size > MAX_LOCAL_VIDEO_BYTES
          ? 'O vídeo ultrapassa 50 MB. Escolha uma versão menor.'
          : 'Escolha um vídeo válido para continuar.',
      },
    ]);
  }

  if (mission.kind === 'business') {
    return result(mission, [{
      id: 'business-configured',
      label: mission.criteria[0] || 'Possuir um negócio salvo',
      met: evidence.businessConfigured === true,
      guidance: 'Configure e salve seu negócio antes de concluir esta missão.',
    }]);
  }

  return result(mission, [{
    id: 'unsupported-mission',
    label: 'Atividade disponível',
    met: false,
    guidance: 'Esta atividade ainda não pode ser validada.',
  }]);
}

