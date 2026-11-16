// Memória em segundo plano: junta o que foi falado por alguns minutos,
// manda o TEXTO para a IA, que extrai pessoas, compromissos, fatos e avisos.
import { analisarTexto } from './gemini';
import { contextoMemoria, lerAjustes, salvarAnalise } from './db';
import type { Analise, Ajustes } from './db';
import { agendarAviso, avisarAgora, dataLocal } from './avisos';

type Frase = { t: number; texto: string };
type Item = { inicio: number; texto: string; tentativas: number };

let buffer: Frase[] = [];
const fila: Item[] = [];
let processando = false;
let ultimoErro = '';
let analisados = 0;
let descartados = 0;
let relogio: ReturnType<typeof setInterval> | null = null;
let falarAviso: (texto: string) => void = () => {};
const ouvintes = new Set<() => void>();

export function estadoCerebro() {
  const palavras = buffer.reduce((n, f) => n + f.texto.split(/\s+/).length, 0);
  return { naFila: fila.length, noBuffer: palavras, ultimoErro, analisados, descartados };
}

export function aoMudarCerebro(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

function avisarOuvintes() {
  ouvintes.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

/** Liga o relógio que manda o texto acumulado para a IA a cada N minutos. */
export function iniciarCerebro(minutos: number, falar: (texto: string) => void): void {
  falarAviso = falar;
  if (relogio) clearInterval(relogio);
  relogio = setInterval(() => verificarBuffer(minutos), 20_000);
}

export function pararCerebro(): void {
  if (relogio) clearInterval(relogio);
  relogio = null;
  enviarBuffer(true);
}

export function novaFrase(texto: string, t: number): void {
  buffer.push({ t, texto });
  const letras = buffer.reduce((n, f) => n + f.texto.length, 0);
  if (letras > 6000) enviarBuffer(false);
  avisarOuvintes();
}

function verificarBuffer(minutos: number): void {
  if (!buffer.length) return;
  if (Date.now() - buffer[0].t >= minutos * 60_000) enviarBuffer(false);
}

function enviarBuffer(forcar: boolean): void {
  if (!buffer.length) return;
  const palavras = buffer.reduce((n, f) => n + f.texto.split(/\s+/).length, 0);
  if (palavras < 20 && !forcar) {
    // Pouca fala: espera juntar mais, mas não guarda para sempre.
    if (Date.now() - buffer[0].t < 30 * 60_000) return;
    buffer = [];
    descartados++;
    avisarOuvintes();
    return;
  }
  if (palavras < 5) {
    buffer = [];
    return;
  }
  const texto = buffer
    .map((f) => {
      const d = new Date(f.t);
      return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}] ${f.texto}`;
    })
    .join('\n');
  fila.push({ inicio: buffer[0].t, texto, tentativas: 0 });
  buffer = [];
  avisarOuvintes();
  rodarFila();
}

async function rodarFila(): Promise<void> {
  if (processando) return;
  processando = true;
  while (fila.length) {
    const item = fila[0];
    try {
      const cfg = await lerAjustes();
      if (!cfg.apiKey) throw new Error('Falta a chave da API. Coloca em Ajustes.');
      const memoria = await contextoMemoria(false);
      const analise = await analisarTexto(cfg, item.texto, item.inicio, memoria);
      if (analise.descartar) {
        descartados++;
      } else {
        analise.transcricao = item.texto;
        await salvarAnalise(analise, item.inicio);
        await reagir(analise, cfg);
        analisados++;
      }
      ultimoErro = '';
      fila.shift();
      avisarOuvintes();
    } catch (e: any) {
      item.tentativas++;
      ultimoErro = String(e?.message ?? e);
      avisarOuvintes();
      if (item.tentativas >= 8) {
        fila.shift();
        continue;
      }
      // Sem internet ou limite do plano grátis: espera e tenta de novo.
      processando = false;
      setTimeout(rodarFila, Math.min(60_000 * item.tentativas, 10 * 60_000));
      return;
    }
  }
  processando = false;
}

async function reagir(a: Analise, cfg: Ajustes): Promise<void> {
  const aviso = a.aviso;
  if (aviso && aviso.mensagem && aviso.nivel === 'urgente') {
    await avisarAgora('NOA — atenção', aviso.mensagem);
    if (cfg.falarAvisos) falarAviso(aviso.mensagem);
  } else if (aviso && aviso.mensagem && aviso.nivel === 'util') {
    await avisarAgora('NOA', aviso.mensagem);
  }

  for (const c of a.compromissos ?? []) {
    const d = dataLocal(c.quando);
    if (!d) continue;
    if (d.temHora) {
      await agendarAviso('Daqui a 30 min', c.descricao, new Date(d.data.getTime() - 30 * 60_000));
    } else {
      await agendarAviso('Hoje tem', c.descricao, d.data); // 9h do dia
    }
  }
}
