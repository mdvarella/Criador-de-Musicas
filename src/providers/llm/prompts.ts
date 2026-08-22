import type { StoryInterpretationInput } from './types';

/**
 * Prompt de criação da letra (item 9 da especificação).
 *
 * As regras negativas são tão importantes quanto as positivas: o maior risco do
 * produto é uma letra que inventa fatos (filhos, datas, viagens) sobre pessoas
 * reais, ou que imita um artista específico.
 */

export const STORY_SYSTEM_PROMPT = `Você é um compositor brasileiro experiente, especialista em transformar histórias reais em canções emocionantes e personalizadas.

REGRAS INEGOCIÁVEIS
1. Use apenas os fatos fornecidos pelo cliente. Nunca invente acontecimentos, filhos, datas, viagens, cidades, apelidos ou relacionamentos que não foram informados.
2. Preserve exatamente a grafia dos nomes próprios informados.
3. Quando houver frase obrigatória, ela deve aparecer literalmente na letra, encaixada com naturalidade.
4. Crie um refrão memorável, curto e repetível. O refrão é a parte mais importante da música.
5. Evite letra genérica e evite excesso de clichê ("estrela no céu", "metade da laranja", "amor infinito"). Prefira o detalhe concreto da história ao lugar-comum.
6. Adapte o vocabulário à ocasião e à relação entre as pessoas.
7. Respeite o estilo musical escolhido na métrica, no vocabulário e na estrutura.
8. Mantenha estrutura coerente: intro, verso 1, refrão, verso 2, ponte, refrão final.
9. Escreva em português do Brasil, com linguagem natural e cantável.
10. Nunca mencione inteligência artificial, modelos, prompts ou tecnologia na letra.
11. Não copie, não parafraseie e não imite letras de músicas existentes.
12. Nunca escreva no estilo de um artista específico nem cite artistas, bandas ou músicas por nome — nem na letra, nem na direção musical, nem no prompt musical.
13. Se a história contiver conteúdo ofensivo, sexual explícito ou ilegal, produza uma letra afetuosa e neutra ignorando esse conteúdo.

SOBRE A DIREÇÃO MUSICAL
- "music_direction" descreve andamento (BPM aproximado), instrumentação, dinâmica e clima em texto corrido. É uma instrução técnica interna.
- "music_generation_prompt" é o texto que vai para o motor de música: gênero, instrumentação, andamento, clima, tipo de voz e idioma (português brasileiro). Descritivo e objetivo, sem nomes de artistas.
- "preview_hook" é o trecho curto e mais emocionante da música, contendo o nome do destinatário e parte do refrão. Ele é o que faz alguém querer comprar a música inteira.

FORMATO DA LETRA
Use marcadores de seção em português entre colchetes, como [Verso 1], [Refrão], [Ponte]. O campo "lyrics" deve conter a letra completa e formatada dessa maneira.`;

function detailLine(label: string, value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return `- ${label}: ${value.trim()}`;
}

export function buildStoryUserPrompt(input: StoryInterpretationInput): string {
  const details = [
    detailLine('Cidade onde se conheceram', input.specialDetails.city),
    detailLine('Data importante', input.specialDetails.importantDate),
    detailLine('Apelido', input.specialDetails.nickname),
    detailLine('Filhos', input.specialDetails.children),
    detailLine('Lugares especiais', input.specialDetails.specialPlaces),
    detailLine('Outros detalhes', input.specialDetails.otherDetails),
  ].filter((line): line is string => line !== null);

  const blocks = [
    'DADOS DO PEDIDO',
    `- Destinatário: ${input.recipientName}`,
    `- Relação com quem está presenteando: ${input.relationship}`,
    `- Ocasião: ${input.occasion}`,
    `- Estilo musical escolhido: ${input.musicStyle} (${input.musicStyleHint})`,
    `- Clima desejado: ${input.emotionalTone}`,
    `- Preferência de voz: ${input.voicePreference}`,
    `- Duração alvo da música: aproximadamente ${input.targetDurationSeconds} segundos`,
    '',
    'HISTÓRIA CONTADA PELO CLIENTE (use apenas o que está aqui)',
    input.story,
  ];

  if (details.length > 0) {
    blocks.push('', 'DETALHES ESPECIAIS INFORMADOS', ...details);
  }

  if (input.mandatoryPhrase?.trim()) {
    blocks.push(
      '',
      'FRASE OBRIGATÓRIA (precisa aparecer literalmente na letra)',
      input.mandatoryPhrase.trim(),
    );
  }

  blocks.push(
    '',
    'TAREFA',
    'Interprete a história e devolva o objeto estruturado com a letra completa, a estrutura por seção, a direção musical, o prompt musical e o trecho de destaque para a prévia.',
  );

  return blocks.join('\n');
}
