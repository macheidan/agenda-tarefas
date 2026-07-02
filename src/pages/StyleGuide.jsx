import { useState } from 'react';
import { Button, Card, Pill, PageHeader, SegmentedControl, Field, Input, Textarea, Select } from '../ui';
import styles from './StyleGuide.module.css';

const SWATCHES = [
  ['--ds-bg', 'Fundo'],
  ['--ds-surface', 'Superfície'],
  ['--ds-ink', 'Texto'],
  ['--ds-muted', 'Texto suave'],
  ['--ds-border', 'Borda'],
  ['--ds-accent', 'Acento'],
  ['--ds-ok', 'Sucesso'],
  ['--ds-warn', 'Atenção'],
  ['--ds-bad', 'Perigo'],
];

const TYPE = [
  ['--ds-text-2xl', 'Título de página', 800],
  ['--ds-text-xl', 'Título de seção', 800],
  ['--ds-text-lg', 'Subtítulo', 600],
  ['--ds-text-md', 'Corpo do texto', 400],
  ['--ds-text-sm', 'Rótulo / meta', 500],
  ['--ds-text-xs', 'Etiqueta', 700],
];

function Section({ title, desc, children }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {desc && <p className={styles.sectionDesc}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export default function StyleGuide() {
  const [mode, setMode] = useState('light');
  const [seg, setSeg] = useState('todas');

  return (
    <div className={styles.root} data-ds="sereno" data-mode={mode}>
      <div className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Design System · Sereno</p>
          <h1 className={styles.h1}>Intranet Dáme &amp; Lov</h1>
        </div>
        <SegmentedControl
          options={[{ value: 'light', label: '☀ Claro' }, { value: 'dark', label: '☾ Escuro' }]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <p className={styles.intro}>
        Componentes React reais do padrão escolhido. Tudo aqui sai de tokens (<code>--ds-*</code>)
        e dos mesmos componentes que vão substituir os botões e cards espalhados pelas telas.
        Alterne claro/escuro no canto.
      </p>

      <div className={styles.grid}>
        <div className={styles.col}>
          <Section title="Cores" desc="Neutros frios + um acento índigo. Semânticos separados do acento.">
            <div className={styles.swatches}>
              {SWATCHES.map(([v, label]) => (
                <div key={v} className={styles.swatch}>
                  <span className={styles.swatchChip} style={{ background: `var(${v})` }} />
                  <span className={styles.swatchName}>{label}</span>
                  <code className={styles.swatchVar}>{v}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Tipografia" desc="Inter, uma escala só. Títulos com peso, corpo respirando.">
            <div className={styles.typeList}>
              {TYPE.map(([v, label, w]) => (
                <div key={v} className={styles.typeRow} style={{ fontSize: `var(${v})`, fontWeight: w }}>
                  {label}
                  <code className={styles.typeVar}>{v}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Botões" desc="Um primário, um secundário, ghost, e perigo (outline e sólido).">
            <div className={styles.row}>
              <Button variant="primary">+ Nova ideia</Button>
              <Button variant="secondary">Cancelar</Button>
              <Button variant="ghost">Editar</Button>
              <Button variant="danger">Excluir</Button>
              <Button variant="dangerSolid">Apagar tudo</Button>
            </div>
            <div className={styles.row}>
              <Button size="sm" variant="primary">Salvar</Button>
              <Button size="sm" variant="secondary">Voltar</Button>
              <Button variant="secondary" square aria-label="Editar">✎</Button>
              <Button variant="danger" square aria-label="Excluir">🗑</Button>
              <Button variant="primary" disabled>Desabilitado</Button>
            </div>
          </Section>

          <Section title="Campos" desc="Input, seleção e área de texto — mesmo padrão, foco com anel de acento.">
            <div className={styles.formGrid}>
              <Field label="Título">
                <Input placeholder="Ex.: Combo família no fim de semana" />
              </Field>
              <Field label="Setor">
                <Select defaultValue="mkt">
                  <option value="mkt">Marketing</option>
                  <option value="ops">Operações</option>
                  <option value="fin">Financeiro</option>
                </Select>
              </Field>
              <Field label="Descrição" hint="Explique a ideia em uma ou duas linhas." className={styles.full}>
                <Textarea placeholder="Escreva aqui…" />
              </Field>
            </div>
          </Section>
        </div>

        <div className={styles.col}>
          <Section title="Etiquetas de status" desc="Cor codifica estado — separada do acento.">
            <div className={styles.row}>
              <Pill tone="neutral">Rascunho</Pill>
              <Pill tone="accent">Em análise</Pill>
              <Pill tone="ok" dot>Aprovada</Pill>
              <Pill tone="warn" dot>Pendente</Pill>
              <Pill tone="bad" dot>Falta não just.</Pill>
            </div>
          </Section>

          <Section title="Alternador de sub-seção" desc="Substitui os vários botões de aba/toggle das telas.">
            <SegmentedControl
              options={[
                { value: 'todas', label: 'Todas' },
                { value: 'minhas', label: 'Minhas' },
                { value: 'arquivadas', label: 'Arquivadas' },
              ]}
              value={seg}
              onChange={setSeg}
            />
          </Section>

          <Section title="Cards" desc="Uma superfície, um raio, uma sombra. Variante com realce ao passar o mouse.">
            <div className={styles.cardRow}>
              <Card>Card padrão (padding médio)</Card>
              <Card hover>Card clicável (passe o mouse)</Card>
            </div>
          </Section>

          <Section title="Tela de exemplo" desc="Os componentes compostos como uma seção real da intranet.">
            <Card padding="none" className={styles.demo}>
              <div className={styles.demoInner}>
                <PageHeader
                  title="Ideias"
                  subtitle="14 ideias · 3 novas"
                  actions={<Button size="sm">+ Nova ideia</Button>}
                />
                <SegmentedControl
                  options={[
                    { value: 'todas', label: 'Todas' },
                    { value: 'minhas', label: 'Minhas' },
                    { value: 'arquivadas', label: 'Arquivadas' },
                  ]}
                  value={seg}
                  onChange={setSeg}
                />
                <div className={styles.demoCards}>
                  <Card hover>
                    <div className={styles.demoCardTop}>
                      <strong>Combo família no fim de semana</strong>
                      <Pill tone="accent">Em análise</Pill>
                    </div>
                    <p className={styles.demoMeta}>
                      <span className={styles.cat} style={{ '--c': '#3a53d0' }}>Marketing</span>
                      · há 2 dias · 3 comentários
                    </p>
                  </Card>
                  <Card hover>
                    <div className={styles.demoCardTop}>
                      <strong>Trocar embalagem da borda recheada</strong>
                      <Pill tone="ok" dot>Aprovada</Pill>
                    </div>
                    <p className={styles.demoMeta}>
                      <span className={styles.cat} style={{ '--c': '#1a8f52' }}>Operações</span>
                      · há 5 dias · 1 comentário
                    </p>
                  </Card>
                </div>
              </div>
            </Card>
          </Section>

          <Section title="Mobile" desc="Disposição própria: barra de abas embaixo e ação principal flutuante.">
            <div className={styles.phone}>
              <div className={styles.phTop}>
                <strong className={styles.phBrand}>Dáme<span>&amp;</span>Lov</strong>
                <span className={styles.phBell}>🔔</span>
              </div>
              <div className={styles.phBody}>
                <div className={styles.phHead}>
                  <h4>Ideias</h4>
                  <Pill tone="ok">14</Pill>
                </div>
                <Card padding="sm">
                  <div className={styles.demoCardTop}>
                    <strong>Combo família</strong>
                    <Pill tone="accent">Análise</Pill>
                  </div>
                  <p className={styles.demoMeta}>Marketing · 2d</p>
                </Card>
                <Card padding="sm">
                  <div className={styles.demoCardTop}>
                    <strong>Borda recheada</strong>
                    <Pill tone="ok" dot>Aprovada</Pill>
                  </div>
                  <p className={styles.demoMeta}>Operações · 5d</p>
                </Card>
                <Button className={styles.fab}>+ Nova ideia</Button>
              </div>
              <div className={styles.phNav}>
                {['Agenda', 'Notas', 'Ideias', 'Compras', 'Mais'].map((t) => (
                  <span key={t} className={t === 'Ideias' ? styles.phNavOn : styles.phNavItem}>
                    <span className={styles.phNavDot} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Section>
        </div>
      </div>

      <p className={styles.foot}>
        Preview isolado — não afeta a produção. Aprovando esta direção, migro as telas para estes
        componentes (começando por Preços Insumos) e publico via o fluxo normal.
      </p>
    </div>
  );
}
