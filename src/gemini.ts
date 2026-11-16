// Cérebro do NOA: conversa com a API do Gemini (plano grátis). Só TEXTO é enviado, nunca áudio.
import type { Ajustes, Analise } from './db';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export class ErroIA extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function chamar(cfg: Ajustes, prompt: string, json: boolean, temperatura = 0.3): Promise<string> {
  const res = await fetch(`${BASE}${cfg.modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperatura,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  const corpo: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErroIA(corpo?.error?.message ?? `Erro HTTP ${res.status}`, res.status);
  }
  const texto = (corpo?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('')
    .trim();
  if (!texto) throw new ErroIA('A IA respondeu vazio', 0);
  return texto;
}

function lerJson(texto: string): any {
  const limpo = texto.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(limpo);
}

function agoraTexto(ms: number): string {
  const d = new Date(ms);
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dias[d.getDay()]}, ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function persona(cfg: Ajustes): string {
  const dono = cfg.nome || 'o dono do celular';
  return `Você é o NOA, o parceiro de ${dono}: amigo, secretário, agenda, informante e conselheiro, que vive no celular dele e escuta o dia dele.
JEITO DE FALAR: ${cfg.jeito || 'coloquial, como amigo próximo brasileiro, frases curtas'}
Fale sempre em português do Brasil, do jeito que as pessoas falam no dia a dia, nunca como robô ou atendente.`;
}

// ---------- Memória: analisar o que foi ouvido ----------

export async function analisarTexto(cfg: Ajustes, texto: string, inicio: number, memoria: string): Promise<Analise> {
  const prompt = `${persona(cfg)}

Abaixo está a transcrição automática do que o microfone do celular ouviu, a partir de ${agoraTexto(inicio)} (horário local).
Ela NÃO separa quem fala e pode ter erros de reconhecimento. Frases com "NOA" são o dono falando com você.

REGRAS:
1. Se for só TV, rádio, música, ou conversa de gente ao redor que claramente não envolve o dono, responda apenas {"descartar": true}.
2. Caso contrário, extraia o que for útil para a memória do dono.
3. Datas: converta "amanhã", "quinta", "dia 20" etc. em data real usando a data acima. Use "AAAA-MM-DDTHH:MM" quando houver horário, "AAAA-MM-DD" quando não houver, ou null.
4. Aviso "urgente" só para: conflito com a agenda abaixo, prazo vencendo, número ou valor errado numa negociação, risco claro.
   Aviso "util" para: alguém da memória apareceu (lembre quem é), surgiu uma dúvida que você sabe responder, ou um toque rápido que ajuda agora.
   Senão, "nenhum". A mensagem do aviso é no seu jeito de falar, curtinha (no máximo 2 frases), direto com o dono.

MEMÓRIA ATUAL:
${memoria}

TRANSCRIÇÃO:
${texto}

Responda SOMENTE com JSON neste formato:
{
  "descartar": false,
  "resumo": "1 ou 2 frases do que aconteceu",
  "contexto": "onde/situação, se der para saber (reunião, almoço, carro...)",
  "pessoas": [{"nome": "Nome", "detalhes": "quem é, empresa, relação, o que falaram"}],
  "compromissos": [{"descricao": "o que foi combinado", "quando": "AAAA-MM-DDTHH:MM ou null", "quem_prometeu": "dono ou outro"}],
  "fatos": ["decisões, valores, informações importantes"],
  "aviso": {"nivel": "urgente | util | nenhum", "mensagem": "texto"}
}`;
  return lerJson(await chamar(cfg, prompt, true)) as Analise;
}

// ---------- Conversa: quando chamam "NOA" ----------

export async function conversar(
  cfg: Ajustes,
  pedido: string,
  conversaRecente: string,
  memoria: string
): Promise<string> {
  const prompt = `${persona(cfg)}

Agora é ${agoraTexto(Date.now())}. O dono acabou de te chamar e você vai RESPONDER FALANDO (a resposta vira voz).
- Responda como amigo, curto: 1 a 3 frases, a não ser que ele peça detalhe.
- Sem listas, sem asteriscos, sem emoji, sem markdown. Números e datas do jeito que se fala.
- Copie o jeito de falar dele (veja a conversa recente abaixo): se ele fala gíria, você fala gíria.
- Use a memória pra responder sobre pessoas, datas e combinados. Se não souber, fala que não sabe e dá a melhor ideia que tiver.
- Se ele pedir opinião ou conselho, seja sincero, mesmo que seja pra discordar.
- Se ele pedir pra lembrar de algo, confirma rapidinho (a memória guarda sozinha).

MEMÓRIA:
${memoria}

O QUE FOI FALADO NOS ÚLTIMOS MINUTOS (pode incluir outras pessoas):
${conversaRecente || '(nada)'}

O DONO DISSE AGORA:
${pedido}`;
  const r = await chamar(cfg, prompt, false, 0.7);
  return r.replace(/[*_#`]/g, '').trim();
}

// ---------- Resumo do dia ----------

export async function resumoDoDia(cfg: Ajustes, momentos: string, memoria: string): Promise<string> {
  const prompt = `${persona(cfg)}

Faz o resumo do dia do dono, no seu jeito de falar, curto e organizado:
1) Com quem ele falou e o que importa de cada um
2) O que ele prometeu e o que prometeram pra ele (com datas)
3) Pendências sem data
4) Um toque ou alerta pra amanhã, se tiver

O QUE ROLOU HOJE:
${momentos}

MEMÓRIA GERAL:
${memoria}`;
  return chamar(cfg, prompt, false, 0.5);
}
