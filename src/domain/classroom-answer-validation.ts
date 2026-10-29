export type MissionAnswer = { taskId: string; answer: unknown };
type AnswerTask = {
  id: string; prompt: string; type: string; required: boolean;
  settings: Record<string, unknown>; options: Array<{ value: string; label: string }>;
};

export function validateClassroomMissionAnswers(tasks: AnswerTask[], answers: MissionAnswer[]) {
  const supplied = new Map(answers.map(item => [item.taskId, item.answer]));
  if (supplied.size !== answers.length || answers.some(item => !tasks.some(task => task.id === item.taskId)) || tasks.some(task => task.required && !supplied.has(task.id))) {
    return 'Revise as perguntas obrigatórias antes de enviar o formulário.';
  }
  for (const task of tasks) {
    const answer = supplied.get(task.id);
    const empty = answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);
    if (empty && !task.required) continue;
    const settings = task.settings || {};
    const scaleMin = Number(settings.scaleMin ?? 1);
    const scaleMax = Number(settings.scaleMax ?? 5);
    const valid = task.type === 'complete' ? answer === true
      : task.type === 'text' || task.type === 'short_answer' ? typeof answer === 'string' && answer.trim().length >= 1
        : task.type === 'multiple_choice' || task.type === 'dropdown' ? typeof answer === 'string' && task.options.some(option => option.value === answer)
          : task.type === 'checkboxes' ? Array.isArray(answer) && answer.length > 0 && answer.every(value => task.options.some(option => option.value === value)) && new Set(answer).size === answer.length
            : task.type === 'linear_scale' ? typeof answer === 'string' && Number.isInteger(Number(answer)) && Number(answer) >= scaleMin && Number(answer) <= scaleMax
              : task.type === 'date' ? typeof answer === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(answer) && !Number.isNaN(Date.parse(`${answer}T12:00:00Z`))
                : false;
    if (!valid) return `Confira a resposta: ${task.prompt}`;
  }
  return null;
}
