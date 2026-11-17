// Ações do NOA no iPhone: agenda, lembretes, WhatsApp e localização.
import { Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import { dataLocal } from './avisos';

export type Acao = {
  tipo: 'evento' | 'lembrete' | 'whatsapp';
  titulo?: string;
  inicio?: string | null;
  fim?: string | null;
  local?: string | null;
  quando?: string | null;
  contato?: string;
  texto?: string;
};

// ---------------- Localização ----------------

let ultimoLugar = '';
let ultimoLugarEm = 0;

/** Endereço aproximado de onde o dono está (fica guardado por 3 minutos). */
export async function lugarAtual(): Promise<string> {
  if (ultimoLugar && Date.now() - ultimoLugarEm < 3 * 60_000) return ultimoLugar;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return ultimoLugar;
    let pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (!pos) return ultimoLugar;
    const [e] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    const partes = e
      ? [
          [e.street, e.streetNumber].filter(Boolean).join(', '),
          e.district,
          e.city || e.subregion,
          e.region,
        ].filter(Boolean)
      : [];
    const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    ultimoLugar = partes.length ? `${partes.join(' - ')} (${coords})` : coords;
    ultimoLugarEm = Date.now();
  } catch {}
  return ultimoLugar;
}

/** Pede de uma vez as permissões de localização e agenda. */
export async function pedirPermissoesExtras(): Promise<void> {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch {}
  try {
    await Calendar.requestCalendarPermissionsAsync();
  } catch {}
}

// ---------------- Agenda do iPhone ----------------

async function permissaoAgenda(): Promise<boolean> {
  try {
    const r = await Calendar.requestCalendarPermissionsAsync();
    return r.status === 'granted';
  } catch {
    return false;
  }
}

async function calendarioPadrao(): Promise<string | null> {
  try {
    const c = await Calendar.getDefaultCalendarAsync();
    if (c?.id) return c.id;
  } catch {}
  try {
    const todos = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return todos.find((c) => c.allowsModifications)?.id ?? null;
  } catch {
    return null;
  }
}

export type EventoAgenda = { titulo: string; inicio: Date; fim: Date; local?: string; diaInteiro: boolean };

/** Eventos da agenda do iPhone nos próximos dias. */
export async function eventosProximos(dias = 7): Promise<EventoAgenda[]> {
  try {
    const perm = await Calendar.getCalendarPermissionsAsync();
    if (perm.status !== 'granted') return [];
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!cals.length) return [];
    const ini = new Date();
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini.getTime() + dias * 24 * 3600_000);
    const evs = await Calendar.getEventsAsync(cals.map((c) => c.id), ini, fim);
    return evs
      .map((e) => ({
        titulo: e.title,
        inicio: new Date(e.startDate),
        fim: new Date(e.endDate),
        local: e.location || undefined,
        diaInteiro: !!e.allDay,
      }))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  } catch {
    return [];
  }
}

const p2 = (n: number) => String(n).padStart(2, '0');
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function textoEvento(e: EventoAgenda): string {
  const d = e.inicio;
  const dia = `${DIAS[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  const hora = e.diaInteiro ? 'dia inteiro' : `${p2(d.getHours())}:${p2(d.getMinutes())}–${p2(e.fim.getHours())}:${p2(e.fim.getMinutes())}`;
  return `${dia} ${hora} — ${e.titulo}${e.local ? ' @ ' + e.local : ''}`;
}

/** Agenda dos próximos 7 dias em texto, para a IA saber o que o dono tem marcado. */
export async function agendaEmTexto(): Promise<string> {
  const evs = await eventosProximos(7);
  return evs.length ? evs.slice(0, 40).map(textoEvento).join('\n') : '(agenda vazia ou sem permissão)';
}

async function criarEvento(a: Acao): Promise<string> {
  if (!(await permissaoAgenda())) return 'Não tenho permissão pra mexer na sua agenda. Libera nos Ajustes do iPhone.';
  const cal = await calendarioPadrao();
  if (!cal) return 'Não achei nenhuma agenda no iPhone pra salvar.';
  const ini = dataLocal(a.inicio ?? a.quando);
  if (!ini) return 'Não entendi a data do evento.';
  const fimData = dataLocal(a.fim)?.data ?? new Date(ini.data.getTime() + 60 * 60_000);
  await Calendar.createEventAsync(cal, {
    title: a.titulo || 'Compromisso',
    startDate: ini.data,
    endDate: fimData,
    allDay: !ini.temHora,
    location: a.local || undefined,
    notes: 'Criado pelo NOA',
    alarms: [{ relativeOffset: ini.temHora ? -30 : 9 * 60 }], // 30 min antes, ou 9h do dia
  });
  return '';
}

async function criarLembrete(a: Acao): Promise<string> {
  try {
    const r = await Calendar.requestRemindersPermissionsAsync();
    if (r.status !== 'granted') return 'Não tenho permissão pros Lembretes. Libera nos Ajustes do iPhone.';
    const listas = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
    const lista = listas.find((c) => c.allowsModifications) ?? listas[0];
    if (!lista) return 'Não achei uma lista de lembretes no iPhone.';
    const quando = dataLocal(a.quando ?? a.inicio);
    await Calendar.createReminderAsync(lista.id, {
      title: a.titulo || 'Lembrete do NOA',
      ...(quando ? { dueDate: quando.data, startDate: quando.data, alarms: [{ absoluteDate: quando.data.toISOString() }] } : {}),
      notes: 'Criado pelo NOA',
    } as any);
    return '';
  } catch (e: any) {
    return 'Não consegui criar o lembrete: ' + (e?.message ?? e);
  }
}

// ---------------- WhatsApp ----------------

function normalizarNumero(n: string): string {
  let d = (n || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1); // 0XX de operadora/DDD
  if (d.length === 10 || d.length === 11) d = '55' + d; // número brasileiro sem DDI
  return d;
}

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function numeroDoContato(nome: string): Promise<{ numero: string; nome: string } | null> {
  const perm = await Contacts.requestPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const { data } = await Contacts.getContactsAsync({ name: nome, fields: [Contacts.Fields.PhoneNumbers] });
  let lista = data ?? [];
  if (!lista.length) {
    // tenta só pelo primeiro nome
    const primeiro = nome.split(/\s+/)[0];
    const r = await Contacts.getContactsAsync({ name: primeiro, fields: [Contacts.Fields.PhoneNumbers] });
    lista = r.data ?? [];
  }
  const alvo = semAcento(nome);
  const ordenada = lista
    .filter((c) => c.phoneNumbers?.length)
    .sort((a, b) => {
      const pa = semAcento(a.name ?? '') === alvo ? 0 : semAcento(a.name ?? '').startsWith(alvo) ? 1 : 2;
      const pb = semAcento(b.name ?? '') === alvo ? 0 : semAcento(b.name ?? '').startsWith(alvo) ? 1 : 2;
      return pa - pb;
    });
  const c = ordenada[0];
  if (!c) return null;
  const tel = c.phoneNumbers!.find((p) => /cel|mobile|iphone|whats/i.test(p.label ?? '')) ?? c.phoneNumbers![0];
  return { numero: normalizarNumero(tel.number ?? (tel as any).digits ?? ''), nome: c.name ?? nome };
}

async function abrirWhatsApp(a: Acao): Promise<string> {
  const texto = encodeURIComponent(a.texto ?? '');
  let numero = '';
  if (a.contato) {
    try {
      const c = await numeroDoContato(a.contato);
      if (c?.numero) numero = c.numero;
    } catch {}
  }
  const app = numero ? `whatsapp://send?phone=${numero}&text=${texto}` : `whatsapp://send?text=${texto}`;
  const web = numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
  setTimeout(() => {
    Linking.openURL(app).catch(() => Linking.openURL(web).catch(() => {}));
  }, 1800); // dá tempo do NOA falar antes de abrir o WhatsApp
  return numero || !a.contato ? '' : `Não achei ${a.contato} nos contatos, aí abri o WhatsApp pra você escolher a conversa.`;
}

// ---------------- Executar ----------------

/** Executa as ações pedidas. Devolve avisos curtos do que não deu certo (para o NOA falar). */
export async function executarAcoes(acoes: Acao[] | undefined): Promise<string[]> {
  const problemas: string[] = [];
  for (const a of acoes ?? []) {
    try {
      let r = '';
      if (a.tipo === 'evento') r = await criarEvento(a);
      else if (a.tipo === 'lembrete') r = await criarLembrete(a);
      else if (a.tipo === 'whatsapp') r = await abrirWhatsApp(a);
      if (r) problemas.push(r);
    } catch (e: any) {
      problemas.push('Deu erro numa ação: ' + (e?.message ?? e));
    }
  }
  return problemas;
}
