// Memória do NOA: tudo fica guardado no próprio iPhone (SQLite).
import * as SQLite from 'expo-sqlite';

export type Ajustes = {
  nome: string;
  apiKey: string;
  modelo: string;
  trechoMin: number; // de quantos em quantos minutos manda o que ouviu para a memória
  limiarDb: number; // volume mínimo para contar como fala (dB, negativo)
  minFalaSeg: number; // segundos mínimos de fala para valer a pena analisar
  falarAvisos: boolean;
  horaResumo: number; // hora do lembrete do resumo da noite
  jeito: string; // como o NOA deve falar
  conversaSemNome: boolean; // continuar a conversa sem repetir "NOA"
  // IA
  provedor: 'gemini' | 'openai'; // quem responde quando você chama o NOA
  modeloRapido: string; // modelo Gemini usado na conversa falada (rápido)
  openaiKey: string;
  modeloOpenai: string;
  // Voz
  voz: string; // identificador da voz do iPhone ('' = escolher a melhor automaticamente)
  velocidade: number;
  tom: number;
};

export const AJUSTES_PADRAO: Ajustes = {
  nome: '',
  apiKey: '',
  modelo: 'gemini-flash-latest',
  trechoMin: 5,
  limiarDb: -45,
  minFalaSeg: 10,
  falarAvisos: true,
  horaResumo: 21,
  jeito:
    'Bem coloquial, como amigo próximo brasileiro: frases curtas, "pra", "tá", "beleza", "cara", "fechou". Sem formalidade e sem enrolação. Imita o jeito que eu falo.',
  conversaSemNome: true,
  provedor: 'gemini',
  modeloRapido: 'gemini-flash-lite-latest',
  openaiKey: '',
  modeloOpenai: 'gpt-6-astra',
  voz: '',
  velocidade: 1.0,
  tom: 1.0,
};

export type Pessoa = { id: number; nome: string; detalhes: string; visto_em: number };
export type Compromisso = {
  id: number;
  descricao: string;
  quando: string | null;
  quem: string;
  criado_em: number;
  feito: number;
};
export type Momento = {
  id: number;
  inicio: number;
  resumo: string;
  transcricao: string;
  contexto: string;
};
export type Aviso = { id: number; nivel: string; mensagem: string; criado_em: number };

export type Analise = {
  descartar?: boolean;
  transcricao?: string;
  resumo?: string;
  contexto?: string;
  pessoas?: { nome: string; detalhes: string }[];
  compromissos?: { descricao: string; quando: string | null; quem_prometeu?: string }[];
  fatos?: string[];
  aviso?: { nivel: 'urgente' | 'util' | 'nenhum'; mensagem: string };
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('noa.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT);
        CREATE TABLE IF NOT EXISTS momentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inicio INTEGER, resumo TEXT, transcricao TEXT, contexto TEXT);
        CREATE TABLE IF NOT EXISTS pessoas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT UNIQUE COLLATE NOCASE, detalhes TEXT, visto_em INTEGER);
        CREATE TABLE IF NOT EXISTS compromissos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          descricao TEXT, quando TEXT, quem TEXT, criado_em INTEGER, feito INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS fatos (
          id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT, criado_em INTEGER);
        CREATE TABLE IF NOT EXISTS avisos (
          id INTEGER PRIMARY KEY AUTOINCREMENT, nivel TEXT, mensagem TEXT, criado_em INTEGER);
        CREATE TABLE IF NOT EXISTS conversas (
          id INTEGER PRIMARY KEY AUTOINCREMENT, pedido TEXT, resposta TEXT, criado_em INTEGER);
      `);
      return db;
    })();
  }
  return dbPromise;
}

// ---------- Ajustes ----------

export async function lerAjustes(): Promise<Ajustes> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', ['ajustes']);
  if (!row?.v) return { ...AJUSTES_PADRAO };
  try {
    return { ...AJUSTES_PADRAO, ...JSON.parse(row.v) };
  } catch {
    return { ...AJUSTES_PADRAO };
  }
}

export async function salvarAjustes(a: Ajustes): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', ['ajustes', JSON.stringify(a)]);
}

// ---------- Gravar o que o Gemini entendeu ----------

function dataCurta(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export async function salvarAnalise(a: Analise, inicio: number): Promise<void> {
  const db = await getDb();
  const agora = Date.now();

  await db.runAsync(
    'INSERT INTO momentos (inicio, resumo, transcricao, contexto) VALUES (?, ?, ?, ?)',
    [inicio, a.resumo ?? '', a.transcricao ?? '', a.contexto ?? '']
  );

  for (const p of a.pessoas ?? []) {
    const nome = (p?.nome ?? '').trim();
    if (!nome) continue;
    const linha = `${dataCurta(inicio)}: ${(p.detalhes ?? '').trim()}`;
    const existe = await db.getFirstAsync<{ id: number; detalhes: string }>(
      'SELECT id, detalhes FROM pessoas WHERE nome = ?',
      [nome]
    );
    if (existe) {
      let det = existe.detalhes ? `${existe.detalhes}\n${linha}` : linha;
      if (det.length > 3000) det = det.slice(det.length - 3000);
      await db.runAsync('UPDATE pessoas SET detalhes = ?, visto_em = ? WHERE id = ?', [det, inicio, existe.id]);
    } else {
      await db.runAsync('INSERT INTO pessoas (nome, detalhes, visto_em) VALUES (?, ?, ?)', [nome, linha, inicio]);
    }
  }

  for (const c of a.compromissos ?? []) {
    if (!c?.descricao) continue;
    await db.runAsync(
      'INSERT INTO compromissos (descricao, quando, quem, criado_em) VALUES (?, ?, ?, ?)',
      [c.descricao, c.quando ?? null, c.quem_prometeu ?? '', agora]
    );
  }

  for (const f of a.fatos ?? []) {
    if (!f) continue;
    await db.runAsync('INSERT INTO fatos (texto, criado_em) VALUES (?, ?)', [f, agora]);
  }

  if (a.aviso && a.aviso.nivel && a.aviso.nivel !== 'nenhum' && a.aviso.mensagem) {
    await db.runAsync('INSERT INTO avisos (nivel, mensagem, criado_em) VALUES (?, ?, ?)', [
      a.aviso.nivel,
      a.aviso.mensagem,
      agora,
    ]);
  }
}

// ---------- Leituras para as telas ----------

export async function listarPessoas(): Promise<Pessoa[]> {
  const db = await getDb();
  return db.getAllAsync<Pessoa>('SELECT * FROM pessoas ORDER BY visto_em DESC');
}

export async function listarCompromissos(incluirFeitos = false): Promise<Compromisso[]> {
  const db = await getDb();
  return db.getAllAsync<Compromisso>(
    incluirFeitos
      ? "SELECT * FROM compromissos ORDER BY COALESCE(quando, '9999') ASC"
      : "SELECT * FROM compromissos WHERE feito = 0 ORDER BY COALESCE(quando, '9999') ASC"
  );
}

export async function marcarFeito(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE compromissos SET feito = 1 WHERE id = ?', [id]);
}

export async function listarMomentos(limite = 150): Promise<Momento[]> {
  const db = await getDb();
  return db.getAllAsync<Momento>('SELECT * FROM momentos ORDER BY inicio DESC LIMIT ?', [limite]);
}

export async function momentosDesde(ms: number): Promise<Momento[]> {
  const db = await getDb();
  return db.getAllAsync<Momento>('SELECT * FROM momentos WHERE inicio >= ? ORDER BY inicio ASC', [ms]);
}

export async function listarAvisos(limite = 30): Promise<Aviso[]> {
  const db = await getDb();
  return db.getAllAsync<Aviso>('SELECT * FROM avisos ORDER BY criado_em DESC LIMIT ?', [limite]);
}

export type Conversa = { id: number; pedido: string; resposta: string; criado_em: number };

export async function salvarConversa(pedido: string, resposta: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO conversas (pedido, resposta, criado_em) VALUES (?, ?, ?)', [
    pedido,
    resposta,
    Date.now(),
  ]);
}

export async function listarConversas(limite = 20): Promise<Conversa[]> {
  const db = await getDb();
  return db.getAllAsync<Conversa>('SELECT * FROM conversas ORDER BY criado_em DESC LIMIT ?', [limite]);
}

export async function apagarTudo(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM momentos; DELETE FROM pessoas; DELETE FROM compromissos;
    DELETE FROM fatos; DELETE FROM avisos; DELETE FROM conversas;
  `);
}

// ---------- Contexto de memória enviado para a IA ----------

function horaCurta(ms: number): string {
  const d = new Date(ms);
  return `${dataCurta(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function contextoMemoria(completo: boolean): Promise<string> {
  const db = await getDb();
  const pessoas = await db.getAllAsync<Pessoa>(
    'SELECT * FROM pessoas ORDER BY visto_em DESC LIMIT ?',
    [completo ? 80 : 60]
  );
  const compromissos = await db.getAllAsync<Compromisso>(
    "SELECT * FROM compromissos WHERE feito = 0 ORDER BY COALESCE(quando, '9999') ASC LIMIT 40"
  );
  const partes: string[] = [];

  if (pessoas.length) {
    partes.push(
      'PESSOAS QUE O DONO CONHECE:\n' +
        pessoas
          .map((p) => {
            const det = (p.detalhes ?? '').replace(/\n/g, ' | ');
            return `- ${p.nome}: ${completo ? det.slice(-600) : det.slice(-160)}`;
          })
          .join('\n')
    );
  }
  if (compromissos.length) {
    partes.push(
      'COMPROMISSOS EM ABERTO:\n' +
        compromissos.map((c) => `- ${c.quando ?? 'sem data'} — ${c.descricao}`).join('\n')
    );
  }

  if (completo) {
    const fatos = await db.getAllAsync<{ texto: string; criado_em: number }>(
      'SELECT texto, criado_em FROM fatos ORDER BY criado_em DESC LIMIT 50'
    );
    if (fatos.length) {
      partes.push('FATOS E DECISÕES:\n' + fatos.map((f) => `- ${dataCurta(f.criado_em)}: ${f.texto}`).join('\n'));
    }
    const conversas = await db.getAllAsync<Conversa>(
      'SELECT * FROM conversas ORDER BY criado_em DESC LIMIT 10'
    );
    if (conversas.length) {
      partes.push(
        'ÚLTIMAS CONVERSAS COM O NOA (mais recentes primeiro):\n' +
          conversas.map((c) => `- ${horaCurta(c.criado_em)} Dono: ${c.pedido} | NOA: ${c.resposta}`).join('\n')
      );
    }
    const momentos = await db.getAllAsync<Momento>(
      'SELECT * FROM momentos ORDER BY inicio DESC LIMIT 60'
    );
    if (momentos.length) {
      partes.push(
        'RESUMOS DO QUE ACONTECEU (mais recentes primeiro):\n' +
          momentos.map((m) => `- ${horaCurta(m.inicio)}: ${m.resumo}`).join('\n')
      );
    }
  }

  return partes.join('\n\n') || '(memória ainda vazia)';
}
