import Image from 'next/image';
import { StudentEntry } from '@/components/StudentEntry';

export default function HomePage() {
  return (
    <main className="entry-page">
      <section className="entry-story" aria-labelledby="entry-title">
        <div className="entry-story-content">
          <Image className="entry-logo" src="/branding/cafeflow-logo.png" alt="CaféFlow Software Lab" width={260} height={146} priority />
          <span className="entry-overline">LABORATÓRIO EDUCACIONAL INTERATIVO</span>
          <h1 id="entry-title">Aprendizagem que transforma ideias em <em>projetos.</em></h1>
          <p>Participe da sua turma, desenvolva atividades, compartilhe ideias no InstaLab e acompanhe sua evolução em um ambiente educacional protegido.</p>
          <div className="entry-stats" aria-label="Informações da formação">
            <div><strong>05</strong><span>módulos conectados</span></div>
            <div><strong>20h</strong><span>de aprendizagem</span></div>
            <div><strong>100%</strong><span>ambiente de treino</span></div>
          </div>
        </div>
        <div className="entry-orbit entry-learning-orbit" aria-hidden="true">
          <div className="orbit-ring one" />
          <div className="orbit-ring two" />
          <div className="entry-learning-mark"><strong>CF</strong><span>TURMAS · MISSÕES · PROJETOS</span></div>
        </div>
      </section>
      <section className="entry-form-column" aria-label="Entrada do aluno">
        <StudentEntry />
      </section>
    </main>
  );
}
