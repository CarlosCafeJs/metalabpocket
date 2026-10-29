import { createHash } from 'node:crypto';
import type { ClassroomModule } from '@/server/repository';

export function classroomMissionHash(module: ClassroomModule, missionId: string) {
  const mission = module.missions.find(item => item.id === missionId);
  if (!mission) return null;
  const canonical = {
    module: { id: module.id, title: module.title, description: module.description, position: module.position },
    mission: {
      id: mission.id, moduleId: mission.moduleId, title: mission.title, objective: mission.objective,
      description: mission.description, position: mission.position, isPublished: mission.isPublished,
      tasks: mission.tasks.map(task => ({
        id: task.id, prompt: task.prompt, description: task.description, type: task.type,
        required: task.required, settings: task.settings, options: task.options,
        position: task.position, isPublished: task.isPublished
      }))
    }
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
