// Seed do CMV (fichas técnicas) importado da planilha FICHAS CMV.
// Preenchido a partir das abas BENEFICIADOS e SABORES; os % de kg dos sabores
// foram convertidos para kg absoluto. Usado 1x pelo botão "Importar da planilha"
// (useCmv.seedInitialData), que só aparece com a seção ainda vazia.
//
// Formato:
//   beneficiados: [{ nome, rendimento, lines: [{ ref, qtd }] }]
//     ref = nome_padrao do ingrediente base (Produto planilha); qtd em kg/un.
//     rendimento = kg de saída (perda no preparo); null = usa o peso bruto.
//   sabores: [{ nome, lines: [{ ref, tipo, qtdP, qtdM, qtdG, qtdS }] }]
//     tipo = 'base' (Produto planilha) ou 'beneficiado' (receita acima).
export const CMV_SEED = { beneficiados: [], sabores: [] };
