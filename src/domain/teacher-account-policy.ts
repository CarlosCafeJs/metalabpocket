export type TeacherAccountState = 'pending' | 'active' | 'rejected' | 'suspended' | 'disabled';
export type TeacherAccountAction = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'disable';

const transitions: Record<TeacherAccountAction, { from: TeacherAccountState[]; to: TeacherAccountState }> = {
  approve: { from: ['pending'], to: 'active' },
  reject: { from: ['pending'], to: 'rejected' },
  suspend: { from: ['active'], to: 'suspended' },
  reactivate: { from: ['suspended'], to: 'active' },
  disable: { from: ['pending', 'active', 'rejected', 'suspended'], to: 'disabled' }
};

export function nextTeacherAccountState(current: TeacherAccountState, action: TeacherAccountAction) {
  const transition = transitions[action];
  return transition.from.includes(current) ? transition.to : null;
}

export function isValidTeacherCpf(input: string) {
  const cpf = input.replace(/\D/gu, '');
  if (!/^\d{11}$/u.test(cpf) || /^(\d)\1{10}$/u.test(cpf)) return false;
  const check = (base: string, initialFactor: number) => {
    const sum = [...base].reduce((value, digit) => value + Number(digit) * initialFactor--, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return check(cpf.slice(0, 9), 10) === Number(cpf[9]) && check(cpf.slice(0, 10), 11) === Number(cpf[10]);
}
