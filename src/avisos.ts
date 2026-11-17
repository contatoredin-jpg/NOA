// Notificações locais e voz do NOA.
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function pedirPermissaoAvisos(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function avisarAgora(titulo: string, corpo: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: corpo, sound: true },
      trigger: null,
    });
  } catch {}
}

export async function agendarAviso(titulo: string, corpo: string, data: Date): Promise<void> {
  if (isNaN(data.getTime()) || data.getTime() < Date.now() + 60_000) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: corpo, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: data },
    });
  } catch {}
}

export async function agendarResumoNoturno(hora: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync('resumo-noturno');
  } catch {}
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: 'resumo-noturno',
      content: { title: 'NOA', body: 'Bora ver o resumo do dia? Toca aqui.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: hora, minute: 0 },
    });
  } catch {}
}

export type Voz = { id: string; nome: string; idioma: string; qualidade: string };

let vozAtual: string | undefined;
let velocidade = 1.0;
let tom = 1.0;

function nivel(q: string): number {
  const v = q.toLowerCase();
  if (v.includes('premium')) return 3;
  if (v.includes('enhanced')) return 2;
  return 1;
}

export function nomeQualidade(q: string): string {
  const n = nivel(q);
  return n === 3 ? 'Premium' : n === 2 ? 'Aprimorada' : 'Padrão';
}

/** Banco de vozes: todas as vozes em português instaladas no iPhone, as melhores primeiro. */
export async function listarVozes(): Promise<Voz[]> {
  try {
    const vozes = await Speech.getAvailableVoicesAsync();
    return vozes
      .filter((v) => (v.language ?? '').toLowerCase().startsWith('pt'))
      .map((v) => ({
        id: v.identifier,
        nome: v.name,
        idioma: v.language,
        qualidade: String(v.quality ?? ''),
      }))
      .sort((a, b) => {
        const br = (x: Voz) => (x.idioma.toLowerCase().replace('_', '-') === 'pt-br' ? 1 : 0);
        return nivel(b.qualidade) - nivel(a.qualidade) || br(b) - br(a) || a.nome.localeCompare(b.nome);
      });
  } catch {
    return [];
  }
}

/** Aplica a voz escolhida nos Ajustes. Sem escolha, usa a melhor voz pt-BR instalada. */
export async function configurarVoz(cfg: { voz: string; velocidade: number; tom: number }): Promise<void> {
  velocidade = cfg.velocidade || 1.0;
  tom = cfg.tom || 1.0;
  if (cfg.voz) {
    vozAtual = cfg.voz;
    return;
  }
  const vozes = await listarVozes();
  vozAtual = vozes[0]?.id;
}

/** Fala o texto. aoMudar(true) quando começa, aoMudar(false) quando termina. */
export function falar(
  texto: string,
  aoMudar?: (falando: boolean) => void,
  teste?: { voz?: string; velocidade?: number; tom?: number }
): void {
  try {
    Speech.stop();
    aoMudar?.(true);
    const fim = () => setTimeout(() => aoMudar?.(false), 600);
    Speech.speak(texto, {
      language: 'pt-BR',
      voice: teste?.voz ?? vozAtual,
      rate: teste?.velocidade ?? velocidade,
      pitch: teste?.tom ?? tom,
      onDone: fim,
      onStopped: fim,
      onError: fim,
    });
  } catch {
    aoMudar?.(false);
  }
}

export function pararFala(): void {
  try {
    Speech.stop();
  } catch {}
}

/** Converte "2026-11-20T10:00" ou "2026-11-20" em Date no horário local. */
export function dataLocal(quando: string | null | undefined): { data: Date; temHora: boolean } | null {
  if (!quando) return null;
  const m = quando.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const temHora = m[4] !== undefined;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    temHora ? Number(m[4]) : 9,
    temHora ? Number(m[5]) : 0
  );
  return { data: d, temHora };
}
