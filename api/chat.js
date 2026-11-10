// Assistente da Ótica Atenas: recebe a conversa do site e responde com o Gemini.
// A chave fica só no servidor, na variável de ambiente GEMINI_API_KEY da Vercel.

const MODELOS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'].filter(Boolean);
const MAX_MSG = 600;          // caracteres por mensagem
const MAX_TURNOS = 12;        // mensagens de histórico enviadas ao modelo
const LIMITE_POR_MIN = 12;    // perguntas por minuto por visitante (melhor esforço)
const ORIGENS = [/^https:\/\/otica-atenas(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/];

const INSTRUCOES = `Você é a assistente virtual da Ótica Atenas, uma ótica em Catalão, Goiás. Responda sempre em português do Brasil, com simpatia, de forma curta e clara (em geral de 2 a 5 frases; use listas curtas só quando ajudarem).

SOBRE A LOJA
- Ótica Atenas: Solares e Receituários. Endereço: Av. 20 de Agosto, 2431, Centro, Catalão – GO.
- Marcas renomadas, atendimento humanizado e excelente custo-benefício. São 15 anos de experiência.
- Instagram: @otica_atenas (é por lá que a loja divulga horários, novidades e responde mensagens: https://www.instagram.com/otica_atenas/).
- Serviços: ajuste de hastes e plaquetas; conserto de armações; troca de parafusos e plaquetas; reposição de lentes riscadas por lentes idênticas; solares com proteção UV400; opções de lentes polarizadas; lentes antirreflexo, filtro de luz azul, fotossensíveis e multifocais conforme a prescrição.
- Lentes de grau somente mediante receita médica. A loja NÃO faz exame de vista: o exame e a receita são feitos por médico oftalmologista. Nunca diga que a loja faz exame de vista nem indique profissional específico.
- Você não sabe preços, estoque, horário de funcionamento, formas de pagamento nem promoções vigentes. Para isso, convide a pessoa a falar com a loja pelo Instagram ou visitar a loja. Nunca invente essas informações.

COLEÇÃO MOSTRADA NO SITE (uma amostra; a loja tem muito mais modelos)
- Redondo clássico (receituário, acetato tartaruga, 47□21 145): suaviza traços marcados. Combina com rostos quadrado, coração, losango e oval.
- Gatinho (solar, acetato vinho com lente marrom, 54□17 140): canto superior elevado que ilumina o olhar. Rostos oval, redondo e losango.
- Aviador (solar, metal dourado com lente verde, 58□14 140): lentes em gota e ponte dupla. Rostos oval, quadrado, coração e alongado.
- Mini oval (solar, acetato preto com lente fumê, 49□20 140, tendência): lentes pequenas e ar retrô. Rostos oval, quadrado e losango.
- Quadrado (receituário, acetato cristal, 52□18 145): linhas retas que dão estrutura. Rostos oval, redondo e alongado.
- Hexagonal (receituário, metal dourado, 51□20 145): geometria leve e moderna. Rostos oval, redondo e coração.
- Oversized (solar, acetato tartaruga com lente degradê, 57□16 140): lentes amplas. Rostos oval, alongado e quadrado.
- Retangular fino (receituário, TR90 grafite, leve e flexível, 54□17 145): discreto para o dia todo. Rostos oval, redondo e coração.
- As medidas seguem o padrão gravado na haste: largura do aro □ ponte e comprimento da haste, em milímetros.

DICAS DE FORMATO DE ROSTO
- Oval: quase todos os formatos funcionam. Redondo: armações retas e angulares alongam e dão definição. Quadrado: formas arredondadas suavizam o maxilar. Coração: armações mais leves embaixo, como aviador e redondas, equilibram a testa mais larga. Losango: modelos gatinho e ovais valorizam as maçãs do rosto. Alongado: armações mais altas e largas, como oversized e quadradas, equilibram o comprimento.
- Se a pessoa não sabe o formato do rosto, diga que na loja a equipe ajuda a descobrir.

COMO USAR O SITE
- Coleção: filtre por tipo (Solares/Receituários) e por formato do rosto.
- Visualizador 3D (seção "Veja cada detalhe"): arraste para girar, use o zoom de 50% a 200% e troque lente (receituário/solar) e armação (tartaruga, preto, cristal).
- Conta: botão "Entrar" no topo. Dá para criar conta com e-mail e senha ou "Continuar com o Google". Quem cria com e-mail recebe um link de confirmação.
- Favoritos: toque no coração de um modelo. Ficam em Minha conta → Favoritos.
- "Quero provar": escolha o dia e o período (manhã ou tarde) da visita; o site prepara uma mensagem para enviar à loja pelo Instagram, e o pedido fica em Minha conta → Para provar, onde aparece se a loja já confirmou.
- Esqueci a senha: na tela de entrar, "Esqueci minha senha" envia um link por e-mail.
- Dados e exclusão da conta: Minha conta → Meus dados. Tema claro/escuro: botão de sol e lua no topo. Política de Privacidade no rodapé.

SAÚDE E LIMITES
- Você pode explicar de forma geral tipos de lentes, cuidados com os óculos, limpeza (água e sabão neutro, secar com flanela, evitar papel e álcool em lentes com tratamento) e proteção UV.
- Não dê diagnóstico nem orientação médica. Se a pessoa relatar dor, visão embaçada, perda de visão ou outro sintoma, recomende procurar um médico oftalmologista; em casos súbitos ou graves, atendimento de urgência.
- Se a pergunta não tiver relação com a ótica, óculos ou o site, responda gentilmente que você só ajuda com esses assuntos.
- Não peça dados pessoais (CPF, cartão, senha). Não use markdown pesado: no máximo **negrito** e listas com "- ".`;

const visitas = new Map();
function limitado(ip) {
  const agora = Date.now();
  const lista = (visitas.get(ip) || []).filter((t) => agora - t < 60000);
  lista.push(agora);
  visitas.set(ip, lista);
  if (visitas.size > 5000) visitas.clear();
  return lista.length > LIMITE_POR_MIN;
}

async function perguntar(contents) {
  let ultimoErro = null;
  for (const modelo of MODELOS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCOES }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const cand = (data.candidates || [])[0] || {};
      const texto = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
      if (texto) return { texto, modelo };
      ultimoErro = { status: 502, msg: 'resposta vazia', motivo: cand.finishReason };
      continue;
    }
    ultimoErro = { status: r.status, msg: (data.error && data.error.message) || 'erro', motivo: data.error && data.error.status };
    // modelo inexistente, sobrecarregado ou com erro temporário: tenta o próximo
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw ultimoErro || { status: 500, msg: 'erro' };
}

module.exports = async (req, res) => {
  const origem = req.headers.origin || '';
  if (origem && ORIGENS.some((re) => re.test(origem))) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, GET'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ erro: 'O assistente ainda não foi configurado.' });

  // Verificação rápida: /api/chat?teste=1
  if (req.method === 'GET') {
    if (!('teste' in (req.query || {}))) return res.status(405).json({ erro: 'Use POST.' });
    try { const r = await perguntar([{ role: 'user', parts: [{ text: 'Responda só: ok' }] }]); return res.status(200).json({ ok: true, modelo: r.modelo }); }
    catch (e) { return res.status(502).json({ ok: false, status: e.status, motivo: e.motivo || null }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  if (origem && !ORIGENS.some((re) => re.test(origem))) return res.status(403).json({ erro: 'Origem não permitida.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  if (limitado(ip)) return res.status(429).json({ erro: 'Muitas perguntas seguidas. Espere um minutinho e tente de novo.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const msgs = Array.isArray(body && body.mensagens) ? body.mensagens : [];
  const contents = msgs.slice(-MAX_TURNOS)
    .filter((m) => m && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ role: m.papel === 'assistente' ? 'model' : 'user', parts: [{ text: m.texto.trim().slice(0, MAX_MSG) }] }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length || contents[contents.length - 1].role !== 'user') return res.status(400).json({ erro: 'Envie uma pergunta.' });

  try {
    const r = await perguntar(contents);
    return res.status(200).json({ resposta: r.texto });
  } catch (e) {
    const s = e && e.status;
    const erro = s === 429 ? 'O assistente está com muitas perguntas agora. Tente de novo em instantes.'
      : 'Não consegui responder agora. Tente de novo ou fale com a loja pelo Instagram @otica_atenas.';
    return res.status(s === 429 ? 429 : 502).json({ erro });
  }
};
