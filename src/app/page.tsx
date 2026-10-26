import Image from 'next/image';
import { StudentEntry } from '@/components/StudentEntry';

export default function HomePage() {
  return (
    <main className="entry-page">
      <section className="entry-story" aria-labelledby="entry-title">
        <div className="entry-story-content">
          <Image className="entry-logo" src="/simulator/assets/metalab-logo.png" alt="MetaLab" width={180} height={106} priority />
          <span className="entry-overline">LABORATÓRIO EDUCACIONAL INTERATIVO</span>
          <h1 id="entry-title">Seu negócio digital começa em um ambiente <em>seguro.</em></h1>
          <p>Aprenda a usar um smartphone, criar boas imagens e conversar com clientes em uma experiência protegida, construída para praticar.</p>
          <div className="entry-stats" aria-label="Informações da formação">
            <div><strong>05</strong><span>módulos conectados</span></div>
            <div><strong>20h</strong><span>de aprendizagem</span></div>
            <div><strong>100%</strong><span>ambiente de treino</span></div>
          </div>
        </div>
        <div className="entry-orbit" aria-hidden="true">
          <div className="orbit-ring one" />
          <div className="orbit-ring two" />
          <div className="entry-phone">
            <span className="entry-phone-camera" />
            <div className="entry-phone-screen">
              <small>METALAB · AULA</small>
              <strong>Aprenda<br />fazendo.</strong>
              <i>✦</i>
            </div>
          </div>
        </div>
      </section>
      <section className="entry-form-column" aria-label="Entrada do aluno">
        <StudentEntry />
      </section>
    </main>
  );
}
