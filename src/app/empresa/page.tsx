'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { BusinessProfile, useStudentState } from '@/hooks/useStudentState';

const blankBusiness: BusinessProfile = {
  name: '', segment: '', description: '', mainOffering: '', targetAudience: '', differentiator: '', primaryColor: '#D98B08'
};

const examples: Array<{ label: string; value: BusinessProfile }> = [
  { label: 'Ateliê artesanal', value: { name: 'Ateliê Aurora', segment: 'Artesanato e decoração', description: 'Peças artesanais feitas com cuidado para tornar a casa mais acolhedora.', mainOffering: 'Canecas e peças de cerâmica', targetAudience: 'Pessoas que valorizam presentes feitos à mão e produtos autorais.', differentiator: 'Produção em pequena escala, acabamento manual e atendimento próximo.', primaryColor: '#D98B08' } },
  { label: 'Culinária local', value: { name: 'Sabores do Bairro', segment: 'Alimentação', description: 'Comida afetiva preparada em pequenas porções para encontros e momentos especiais.', mainOffering: 'Bolos, doces e kits para café', targetAudience: 'Famílias e pequenos negócios da região que procuram encomendas cuidadosas.', differentiator: 'Receitas caseiras, ingredientes conhecidos e apresentação caprichada.', primaryColor: '#7B4528' } },
  { label: 'Costura criativa', value: { name: 'Linha Viva', segment: 'Moda e costura', description: 'Peças úteis produzidas com tecido, cor e atenção aos detalhes do dia a dia.', mainOffering: 'Bolsas, nécessaires e ajustes', targetAudience: 'Pessoas que procuram peças práticas e personalizadas.', differentiator: 'Personalização de cores, reaproveitamento de tecidos e produção sob medida.', primaryColor: '#536680' } }
];

export default function EmpresaPage() {
  const session = useStudentState();
  const [form, setForm] = useState<BusinessProfile>(blankBusiness);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (session.business) setForm(session.business);
  }, [session.business]);

  function update<K extends keyof BusinessProfile>(field: K, value: BusinessProfile[K]) {
    setForm(current => ({ ...current, [field]: value }));
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/business', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({
          name: form.name,
          segment: form.segment,
          description: form.description,
          mainOffering: form.mainOffering,
          targetAudience: form.targetAudience,
          differentiator: form.differentiator,
          primaryColor: form.primaryColor
        })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a empresa.');
      await session.refreshBusiness();
      setMessage('Empresa salva. As próximas missões usarão este contexto.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Não foi possível salvar a empresa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      eyebrow="MEU CONTEXTO DE TRABALHO"
      title="Minha Empresa"
      description="Crie um negócio de treino ou descreva o seu. Essas informações conectam as missões de fotografia, comunicação e planejamento."
    >
      <section className="business-layout">
        <div className="business-form-card">
          <div className="example-picker">
            <span>PRECISA DE UM EXEMPLO?</span>
            <div>{examples.map(example => <button key={example.label} type="button" onClick={() => setForm(example.value)}>{example.label}</button>)}</div>
          </div>
          <form className="business-form" onSubmit={save}>
            <div className="field-grid two">
              <label>Nome do negócio<input value={form.name} onChange={event => update('name', event.target.value)} minLength={2} maxLength={100} required /></label>
              <label>Segmento<input value={form.segment} onChange={event => update('segment', event.target.value)} minLength={2} maxLength={80} placeholder="Ex.: alimentação, artesanato" required /></label>
            </div>
            <label>Descrição<textarea value={form.description} onChange={event => update('description', event.target.value)} minLength={15} maxLength={500} rows={4} placeholder="Explique de forma simples o que o negócio faz." required /></label>
            <label>Produto ou serviço principal<input value={form.mainOffering} onChange={event => update('mainOffering', event.target.value)} minLength={2} maxLength={160} required /></label>
            <div className="field-grid two">
              <label>Público-alvo<textarea value={form.targetAudience} onChange={event => update('targetAudience', event.target.value)} minLength={10} maxLength={240} rows={3} required /></label>
              <label>Diferencial<textarea value={form.differentiator} onChange={event => update('differentiator', event.target.value)} minLength={10} maxLength={240} rows={3} required /></label>
            </div>
            <label className="color-field">Cor principal<span><input type="color" value={form.primaryColor} onChange={event => update('primaryColor', event.target.value.toUpperCase())} /><input value={form.primaryColor} onChange={event => update('primaryColor', event.target.value)} pattern="#[0-9A-Fa-f]{6}" maxLength={7} required /></span></label>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar minha empresa'}</button><p role="status" aria-live="polite">{message}</p></div>
          </form>
        </div>

        <aside className="business-preview" style={{ '--business-color': form.primaryColor } as React.CSSProperties}>
          <span className="section-tag">PRÉVIA DO PERFIL</span>
          <div className="preview-logo">{form.name.charAt(0).toUpperCase() || 'M'}</div>
          <h2>{form.name || 'Nome do negócio'}</h2>
          <small>{form.segment || 'Seu segmento'}</small>
          <p>{form.description || 'Uma descrição clara ajuda as pessoas a entenderem o que você oferece.'}</p>
          <dl>
            <div><dt>Oferta principal</dt><dd>{form.mainOffering || 'A definir'}</dd></div>
            <div><dt>Para quem</dt><dd>{form.targetAudience || 'A definir'}</dd></div>
            <div><dt>O que torna especial</dt><dd>{form.differentiator || 'A definir'}</dd></div>
          </dl>
          <div className="preview-note"><span aria-hidden="true">✦</span> Este perfil é usado somente nas atividades do curso.</div>
        </aside>
      </section>
    </AppShell>
  );
}
