export type TeacherRole = 'teacher' | 'admin';

export function rejectLegacyTeacherSession(_token: string) {
  return false;
}

export function canAccessTeacherAdmin(role: TeacherRole | null) {
  return role === 'admin';
}
