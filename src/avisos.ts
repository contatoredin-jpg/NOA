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

let vozEscolhida: string | undefined;

/** Procura a melhor voz em português do Brasil instalada no iPhone. */
export async function escolherVoz(): Promise<void> {
  try {
    const vozes = await Speech.getAvailableVoicesAsync();
    const pt = vozes.filter((v) => (v.language ?? '').toLowerCase().replace('_', '-').startsWith('pt-br'));
    const boa = pt.find((v) => String(v.quality).toLowerCase() === 'enhanced') ?? pt[0];
    vozEscolhida = boa?.identifier;
  } catch {}
}

/** Fala o texto. aoMudar(true) quando começa, aoMudar(false) quando termina. */
export function falar(texto: string, aoMudar?: (falando: boolean) => void): void {
  try {
    Speech.stop();
    aoMudar?.(true);
    const fim = () => setTimeout(() => aoMudar?.(false), 700);
    Speech.speak(texto, {
      language: 'pt-BR',
      voice: vozEscolhida,
      rate: 1.05,
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
