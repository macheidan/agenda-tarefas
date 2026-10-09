// Dicionários da aba Postagens (PostagensView + PostagemModal).

export const MARCA_LABEL = { dame: 'Dáme', lov: 'Lov' };
export const TIPO_LABEL = { post: 'Post', story: 'Story' };
export const FORMATO_LABEL = { IMAGEM: 'Imagem', VIDEO: 'Vídeo', CARROSSEL: 'Carrossel' };
export const STATUS = {
  agendado: { label: 'Agendado', cls: 'stAgendado', icon: '◷' },
  processando: { label: 'Processando', cls: 'stProcessando', icon: '↻' },
  publicado: { label: 'Publicado', cls: 'stPublicado', icon: '✓' },
  erro: { label: 'Erro', cls: 'stErro', icon: '!' },
  cancelado: { label: 'Cancelado', cls: 'stCancelado', icon: '–' },
};

export const pad = (n) => String(n).padStart(2, '0');
export const hora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const statusDe = (s) => STATUS[String(s || '').trim().toLowerCase()] || STATUS.agendado;
