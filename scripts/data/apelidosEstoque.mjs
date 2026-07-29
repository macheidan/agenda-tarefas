// Apelidos usados na migração do estoque da planilha.
//
// PLANILHA_PARA_CATALOGO: nome do produto nas abas ESTOQUE MENSAL -> nome do
// item no catálogo de Compras (comprasItens). É como a contagem achou o item.
//
// PLANILHA_PARA_PRODUTOS: nome nas abas ESTOQUE MENSAL -> nome do produto na
// base de Preços (produtos.nome), quando os dois escrevem o mesmo produto de
// formas diferentes. É como o item acha o "Produto (planilha)" e, com ele, o
// preço.
//
// Só entram casos em que dá pra afirmar que é o mesmo produto — na dúvida, fica
// de fora e aparece no relatório do script.

export const PLANILHA_PARA_CATALOGO = {
  '25cm - Dáme (Cia Gráfica)': 'Dame Caixa 25cm',
  '25cm - Lov (Cia Gráfica)': 'Lov Caixa 25cm',
  '30cm - Lov (Cia Gráfica)': 'Lov Caixa 30cm',
  '35cm - Dáme (Colombo)': 'Dame Caixa 35cm',
  '35cm - Lov (Cia Gráfica)': 'Lov Caixa 35cm',
  '45cm - Dáme (Colombo)': 'Dame Caixa 45cm',
  '45cm - Lov (Cia Gráfica)': 'Lov Caixa 45 cm',
  'Amaciante Carne de': 'Amaciante Carne 1kg',
  'Azeit Preta inteira': 'Azeite Preta inteira S/C',
  'Bacon Fatiado': 'Bacon Beiquim fatiado - cx c/ 12 unid.',
  'Batata Palha': 'Batata Palha 1kg',
  'Bisnaga Cheddar Borda': 'Bisnaga Cheddar',
  'Bisnaga Requeijão Sta Clara': 'Bisnaga Requeijão - Recheio',
  'Bisnaga gorgonzola (Focatto)': 'Bisnaga de Gorgonzola',
  'Café Torrado Preto de 500g': 'Café Torrado Preto 500g',
  'Caldo de Carne': 'Caldo Carne 1kg',
  'Caldo de Galinha': 'Caldo Galinha 1kg',
  'Camarão (G)': 'Camarão Grande',
  'Canela em pó': 'Canela em Pó - 200g',
  'Carne de Primeira (Tatu)': 'Carne de Primeira',
  'Cerveja Corona': 'Cerveja Corona Long Neck',
  'Cerveja Heineken': 'Cerveja Heineken Long Neck',
  'Cerveja Stella': 'Cerveja Stella Long Neck',
  'Chocolate ao leite ralado': 'Choco ao Leite Ralado Ref 724 (5kg)',
  'Chocolate branco ralado': 'Choco Branco Ralado Ref 725 (5kg)',
  'Coloreti': 'Coloreti Tradicional 1kg',
  'Copo Plástico Transparente 300ml com 100': 'Copo Plástico Transparente 300ml',
  'Creme de Leite': 'Creme de Leite 1L',
  'Esponja de louça (10 un)': 'Esponja',
  'Extrato de Tomate': 'Extrato de Tomate 4,1kg',
  'Farinha Tipo Pizza': 'Farinha Tipo Pizza 5kg',
  'Leite Condensado de 5kg': 'Leite Condensado 5kg',
  'Mesinhas 500un': 'Mesinha de Pizza',
  'Milho de 2kg': 'Milho 2kg',
  'Nescau de 2kg': 'Nescau 2kg',
  'Pano Microfibra Varias Cores com 4': 'Pano Microfibra Variadas Cores',
  'Pano perfex azul (28cm x 240m)': 'Perfex Azul',
  'Papel Toalha Interfolhado (1000)': 'Papel Toalha Interfolhado',
  'Papel Toalha Rolo Cozinha com 2': 'Papel Toalha Rolo',
  'Peito de Frango': 'Peito de Frango Congelado',
  'Presunto cru italiano fatiado': 'Presunto Parma (100g)',
  // As duas marcas de mussarela são linhas separadas na planilha e itens
  // separados no catálogo — cada uma no seu fornecedor.
  'Queijo Mussarela': { produto: 'Queijo Mussarela', marca: 'São Domingos' },
  'Queijo Mussarela Santa Clara': { produto: 'Queijo Mussarela', marca: 'Santa Clara' },
  'Rolão 300mt pacote (c/8 unid)': 'Rolão Luxo 300mts',
  'Sabão em pó': 'Sabão em Pó 1kg',
  'Saco Lixo 105LT 0.10m com 100 sacos': 'Saco Lixo 105LT',
  'Sacola Reciclada de 3kg 38x48': 'Sacola Reciclada Verde 3kg',
  'Salsa': 'Salsinha',
  'Sêmola de Trigo': 'Semola de Trigo M35',
  'Tempero tipo Sazon  (12un 5g) carne': 'Tempero Carne 60g',
  'Tempero tipo Sazon  (12un 5g) galinha': 'Tempero Frango 60g',
  'Tempero tipo Sazon  (12un 5g) legumes': 'Tempero Legumes 60g',
};

// Itens do catálogo cujo nome não aparece em lugar nenhum da base de Preços,
// mas que são o mesmo produto de um nome que aparece.
export const CATALOGO_PARA_PRODUTOS = {
  'Água c/ Gás 500ml': 'Água com gás 500ml',
  'Água s/ Gás 500ml': 'Água sem gás 500ml',
};

export const PLANILHA_PARA_PRODUTOS = {
  'Esponja de louça (10 un)': 'esponja de louça',
  'Bobina térmica 80x40m': 'Bobina térmica 80x40m (cx 30 unid)',
  'Bobina térmica 80x80m': 'Bobina térmica 80x80m (cx 16 unid)',
  'Tempero tipo Sazon  (12un 5g) carne': 'tempero tipo Sazon 60g carne',
  'Tempero tipo Sazon  (12un 5g) galinha': 'tempero tipo Sazon 60g galinha',
  'Tempero tipo Sazon  (12un 5g) legumes': 'tempero tipo Sazon 60g legumes',
};
