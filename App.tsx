import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ouvido } from './src/ouvido';
import { aoMudarCerebro, estadoCerebro, iniciarCerebro, novaFrase, pararCerebro } from './src/cerebro';
import {
  AJUSTES_PADRAO,
  apagarTudo,
  contextoMemoria,
  lerAjustes,
  listarAvisos,
  listarCompromissos,
  listarConversas,
  listarMomentos,
  listarPessoas,
  marcarFeito,
  momentosDesde,
  salvarAjustes,
  salvarConversa,
} from './src/db';
import type { Ajustes, Aviso, Compromisso, Conversa, Momento, Pessoa } from './src/db';
import { conversar, resumoDoDia } from './src/gemini';
import {
  agendarResumoNoturno,
  avisarAgora,
  escolherVoz,
  falar,
  pararFala,
  pedirPermissaoAvisos,
} from './src/avisos';

type Aba = 'inicio' | 'conversar' | 'pessoas' | 'agenda' | 'diario' | 'ajustes';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'inicio', nome: 'Início' },
  { id: 'conversar', nome: 'Conversar' },
  { id: 'pessoas', nome: 'Pessoas' },
  { id: 'agenda', nome: 'Agenda' },
  { id: 'diario', nome: 'Diário' },
  { id: 'ajustes', nome: 'Ajustes' },
];

const OI = ['Fala!', 'Oi, tô aqui.', 'Diz aí.', 'Opa, fala.', 'Pode falar.'];

const fmt = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function App() {
  const ouvidoRef = useRef<Ouvido | null>(null);
  const [aba, setAba] = useState<Aba>('inicio');
  const [status, setStatus] = useState('Desligado');
  const [ligado, setLigado] = useState(false);
  const [parcial, setParcial] = useState('');
  const [cerebro, setCerebro] = useState(estadoCerebro());
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [versao, setVersao] = useState(0); // força recarregar listas

  // Fala e avisa o ouvido para não ouvir a própria voz.
  const dizer = useCallback((texto: string) => {
    falar(texto, (f) => ouvidoRef.current?.definirFalando(f));
  }, []);

  const responder = useCallback(
    async (comando: string, recente: string) => {
      if (!comando) {
        dizer(OI[Math.floor(Math.random() * OI.length)]);
        return;
      }
      setStatus('Pensando...');
      try {
        const cfg = await lerAjustes();
        const r = await conversar(cfg, comando, recente, await contextoMemoria(true));
        await salvarConversa(comando, r);
        setVersao((v) => v + 1);
        dizer(r);
      } catch (e: any) {
        dizer('Xi, não consegui pensar agora. Tô sem internet ou a IA travou.');
        avisarAgora('NOA', 'Erro ao responder: ' + (e?.message ?? e));
      }
      if (ouvidoRef.current?.ligado) setStatus(`Ouvindo (${ouvidoRef.current.modo})`);
    },
    [dizer]
  );

  if (!ouvidoRef.current) {
    ouvidoRef.current = new Ouvido({
      aoTexto: (frase, quando) => novaFrase(frase, quando),
      aoParcial: setParcial,
      aoChamado: (comando, recente) => {
        responder(comando, recente);
      },
      aoMudarStatus: setStatus,
      aoFalhar: (msg) => avisarAgora('NOA', msg),
    });
  }

  useEffect(() => {
    lerAjustes().then(setAjustes);
    escolherVoz();
    const sair = aoMudarCerebro(() => {
      setCerebro(estadoCerebro());
      setVersao((v) => v + 1);
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        ouvidoRef.current?.verificar();
        setVersao((v) => v + 1);
      }
    });
    return () => {
      sair();
      sub.remove();
    };
  }, []);

  const alternarEscuta = useCallback(async () => {
    const ouvido = ouvidoRef.current!;
    if (ouvido.ligado) {
      ouvido.desligar();
      pararCerebro();
      setLigado(false);
      setParcial('');
      return;
    }
    const cfg = await lerAjustes();
    if (!cfg.apiKey) {
      Alert.alert('Falta a chave', 'Coloca a chave da API do Gemini em Ajustes antes de ligar.');
      setAba('ajustes');
      return;
    }
    try {
      await pedirPermissaoAvisos();
      await agendarResumoNoturno(cfg.horaResumo);
      iniciarCerebro(cfg.trechoMin, dizer);
      await ouvido.ligar({ conversaSemNome: cfg.conversaSemNome });
      setLigado(true);
      dizer('Tô ligado. É só chamar NOA.');
    } catch (e: any) {
      Alert.alert('Não deu pra ligar', String(e?.message ?? e));
    }
  }, [dizer]);

  return (
    <View style={s.tela}>
      <StatusBar style="light" />
      <View style={s.topo}>
        <Text style={s.marca}>NOA</Text>
        <View style={[s.bolinha, { backgroundColor: ligado ? '#3ddc84' : '#555' }]} />
        <Text style={s.statusTopo} numberOfLines={1}>
          {status}
        </Text>
      </View>

      <View style={s.conteudo}>
        {aba === 'inicio' && (
          <Inicio
            ligado={ligado}
            parcial={parcial}
            cerebro={cerebro}
            alternar={alternarEscuta}
            versao={versao}
            ajustes={ajustes}
            dizer={dizer}
          />
        )}
        {aba === 'conversar' && <Conversar dizer={dizer} />}
        {aba === 'pessoas' && <Pessoas versao={versao} />}
        {aba === 'agenda' && <Agenda versao={versao} />}
        {aba === 'diario' && <Diario versao={versao} />}
        {aba === 'ajustes' && <AjustesTela inicial={ajustes} aoSalvar={setAjustes} />}
      </View>

      <View style={s.abas}>
        {ABAS.map((a) => (
          <Pressable key={a.id} onPress={() => setAba(a.id)} style={s.aba}>
            <Text style={[s.abaTxt, aba === a.id && s.abaAtiva]}>{a.nome}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------- Telas ----------------

function Inicio(p: {
  ligado: boolean;
  parcial: string;
  cerebro: ReturnType<typeof estadoCerebro>;
  alternar: () => void;
  versao: number;
  ajustes: Ajustes;
  dizer: (t: string) => void;
}) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [resumo, setResumo] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    listarAvisos(10).then(setAvisos);
    listarConversas(5).then(setConversas);
  }, [p.versao]);

  const gerarResumo = async () => {
    setCarregando(true);
    try {
      const cfg = await lerAjustes();
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const ms = await momentosDesde(hoje.getTime());
      if (!ms.length) {
        setResumo('Ainda não tenho nada de hoje.');
      } else {
        const texto = ms.map((m) => `${fmt(m.inicio)} — ${m.resumo}\n${m.transcricao}`).join('\n\n');
        setResumo(await resumoDoDia(cfg, texto.slice(-60000), await contextoMemoria(false)));
      }
    } catch (e: any) {
      setResumo('Não consegui fazer o resumo: ' + (e?.message ?? e));
    }
    setCarregando(false);
  };

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Pressable onPress={p.alternar} style={[s.botaoGrande, p.ligado ? s.botaoDesligar : s.botaoLigar]}>
        <Text style={s.botaoGrandeTxt}>{p.ligado ? 'Parar de ouvir' : 'Ligar o NOA'}</Text>
      </Pressable>
      {p.ligado && (
        <View style={s.cartao}>
          <Text style={s.cinza}>Ouvindo agora</Text>
          <Text style={s.texto}>{p.parcial || '…'}</Text>
        </View>
      )}
      <Text style={s.cinza}>
        Diz "NOA" e fala o que quiser. {p.cerebro.analisados} trechos guardados · {p.cerebro.noBuffer} palavras esperando ·{' '}
        {p.cerebro.naFila} na fila
      </Text>
      {!!p.cerebro.ultimoErro && <Text style={s.erro}>Último erro: {p.cerebro.ultimoErro}</Text>}
      {!p.ajustes.nome && <Text style={s.dica}>Coloca teu nome em Ajustes pro NOA te chamar pelo nome.</Text>}

      {conversas.length > 0 && <Text style={s.titulo}>Últimas conversas</Text>}
      {conversas.map((c) => (
        <View key={c.id} style={s.cartao}>
          <Text style={s.cinza}>{fmt(c.criado_em)} · você: {c.pedido}</Text>
          <Text style={s.texto}>{c.resposta}</Text>
        </View>
      ))}

      <Pressable onPress={gerarResumo} style={s.botao}>
        <Text style={s.botaoTxt}>{carregando ? 'Pensando...' : 'Resumo de hoje'}</Text>
      </Pressable>
      {!!resumo && (
        <View style={s.cartao}>
          <Text style={s.texto}>{resumo}</Text>
          <Pressable onPress={() => p.dizer(resumo)}>
            <Text style={s.link}>Ouvir</Text>
          </Pressable>
        </View>
      )}

      <Text style={s.titulo}>Avisos</Text>
      {avisos.length === 0 && <Text style={s.cinza}>Nenhum aviso ainda.</Text>}
      {avisos.map((a) => (
        <View key={a.id} style={[s.cartao, a.nivel === 'urgente' && s.cartaoUrgente]}>
          <Text style={s.cinza}>{fmt(a.criado_em)}</Text>
          <Text style={s.texto}>{a.mensagem}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Conversar({ dizer }: { dizer: (t: string) => void }) {
  const [pedido, setPedido] = useState('');
  const [resposta, setResposta] = useState('');
  const [lendo, setLendo] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const enviar = async () => {
    if (!pedido.trim()) return;
    Keyboard.dismiss();
    setCarregando(true);
    try {
      const cfg = await lerAjustes();
      const r = await conversar(cfg, pedido, '', await contextoMemoria(true));
      await salvarConversa(pedido, r);
      setResposta(r);
      if (lendo) dizer(r);
    } catch (e: any) {
      setResposta('Não consegui responder: ' + (e?.message ?? e));
    }
    setCarregando(false);
  };

  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.cinza}>Prefere escrever? Manda aqui. Com o NOA ligado, é só falar "NOA" em voz alta.</Text>
      <TextInput
        style={[s.input, { minHeight: 90 }]}
        multiline
        placeholder="Ex.: quem era o corretor que conheci ontem?"
        placeholderTextColor="#777"
        value={pedido}
        onChangeText={setPedido}
      />
      <View style={s.linha}>
        <Text style={s.texto}>Ler a resposta em voz alta</Text>
        <Switch value={lendo} onValueChange={setLendo} />
      </View>
      <Pressable onPress={enviar} style={s.botao}>
        <Text style={s.botaoTxt}>{carregando ? 'Pensando...' : 'Mandar'}</Text>
      </Pressable>
      {!!resposta && (
        <View style={s.cartao}>
          <Text style={s.texto}>{resposta}</Text>
          <Pressable onPress={pararFala}>
            <Text style={s.link}>Parar voz</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function Pessoas({ versao }: { versao: number }) {
  const [lista, setLista] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<number | null>(null);
  useEffect(() => {
    listarPessoas().then(setLista);
  }, [versao]);
  const filtradas = lista.filter(
    (p) => !busca || (p.nome + ' ' + p.detalhes).toLowerCase().includes(busca.toLowerCase())
  );
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <TextInput
        style={s.input}
        placeholder="Buscar pessoa ou assunto"
        placeholderTextColor="#777"
        value={busca}
        onChangeText={setBusca}
      />
      {filtradas.length === 0 && <Text style={s.cinza}>Ninguém por aqui ainda.</Text>}
      {filtradas.map((p) => (
        <Pressable key={p.id} onPress={() => setAberta(aberta === p.id ? null : p.id)} style={s.cartao}>
          <Text style={s.nome}>{p.nome}</Text>
          <Text style={s.cinza}>Visto em {fmt(p.visto_em)}</Text>
          <Text style={s.texto} numberOfLines={aberta === p.id ? undefined : 2}>
            {p.detalhes}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Agenda({ versao }: { versao: number }) {
  const [lista, setLista] = useState<Compromisso[]>([]);
  const [v, setV] = useState(0);
  useEffect(() => {
    listarCompromissos().then(setLista);
  }, [versao, v]);
  return (
    <ScrollView contentContainerStyle={s.pad}>
      {lista.length === 0 && <Text style={s.cinza}>Nenhum compromisso em aberto.</Text>}
      {lista.map((c) => (
        <View key={c.id} style={s.cartao}>
          <Text style={s.nome}>{c.quando ? c.quando.replace('T', ' às ') : 'Sem data'}</Text>
          <Text style={s.texto}>{c.descricao}</Text>
          {!!c.quem && <Text style={s.cinza}>Quem prometeu: {c.quem}</Text>}
          <Pressable
            onPress={async () => {
              await marcarFeito(c.id);
              setV((x) => x + 1);
            }}
          >
            <Text style={s.link}>Marcar como feito</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function Diario({ versao }: { versao: number }) {
  const [lista, setLista] = useState<Momento[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);
  useEffect(() => {
    listarMomentos().then(setLista);
  }, [versao]);
  return (
    <ScrollView contentContainerStyle={s.pad}>
      {lista.length === 0 && <Text style={s.cinza}>O diário começa quando você ligar o NOA.</Text>}
      {lista.map((m) => (
        <Pressable key={m.id} onPress={() => setAberto(aberto === m.id ? null : m.id)} style={s.cartao}>
          <Text style={s.cinza}>
            {fmt(m.inicio)}
            {m.contexto ? ' · ' + m.contexto : ''}
          </Text>
          <Text style={s.texto}>{m.resumo}</Text>
          {aberto === m.id && <Text style={[s.texto, s.transcricao]}>{m.transcricao}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function AjustesTela({ inicial, aoSalvar }: { inicial: Ajustes; aoSalvar: (a: Ajustes) => void }) {
  const [a, setA] = useState<Ajustes>(inicial);
  const num = (txt: string, padrao: number) => {
    const n = Number(txt.replace(',', '.'));
    return isNaN(n) ? padrao : n;
  };
  const salvar = async () => {
    const limpo = {
      ...a,
      apiKey: a.apiKey.trim(),
      modelo: a.modelo.trim() || AJUSTES_PADRAO.modelo,
      jeito: a.jeito.trim() || AJUSTES_PADRAO.jeito,
    };
    await salvarAjustes(limpo);
    await agendarResumoNoturno(limpo.horaResumo);
    aoSalvar(limpo);
    Alert.alert('Fechou', 'Ajustes salvos. Se o NOA estiver ligado, desliga e liga de novo pra valer.');
  };
  const campo = (rotulo: string, valor: string, mudar: (t: string) => void, extra: any = {}) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <TextInput style={s.input} value={valor} onChangeText={mudar} placeholderTextColor="#777" {...extra} />
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {campo('Seu nome', a.nome, (t) => setA({ ...a, nome: t }))}
      {campo('Chave da API do Gemini', a.apiKey, (t) => setA({ ...a, apiKey: t }), {
        secureTextEntry: true,
        autoCapitalize: 'none',
        autoCorrect: false,
        placeholder: 'Cola aqui (aistudio.google.com)',
      })}
      {campo('Jeito de falar do NOA', a.jeito, (t) => setA({ ...a, jeito: t }), {
        multiline: true,
        style: [s.input, { minHeight: 90 }],
      })}
      {campo('Modelo da IA', a.modelo, (t) => setA({ ...a, modelo: t }), { autoCapitalize: 'none', autoCorrect: false })}
      {campo('Guardar na memória a cada (minutos)', String(a.trechoMin), (t) =>
        setA({ ...a, trechoMin: Math.max(1, num(t, 5)) }), { keyboardType: 'numeric' })}
      {campo('Hora do resumo da noite (0–23)', String(a.horaResumo), (t) =>
        setA({ ...a, horaResumo: Math.min(23, Math.max(0, Math.round(num(t, 21)))) }), { keyboardType: 'numeric' })}
      <View style={s.linha}>
        <Text style={[s.texto, { flex: 1 }]}>Continuar a conversa sem repetir "NOA" (8 segundos)</Text>
        <Switch value={a.conversaSemNome} onValueChange={(v) => setA({ ...a, conversaSemNome: v })} />
      </View>
      <View style={s.linha}>
        <Text style={[s.texto, { flex: 1 }]}>Falar avisos urgentes em voz alta</Text>
        <Switch value={a.falarAvisos} onValueChange={(v) => setA({ ...a, falarAvisos: v })} />
      </View>
      <Pressable onPress={salvar} style={s.botao}>
        <Text style={s.botaoTxt}>Salvar</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert('Apagar tudo?', 'Apaga pessoas, diário, compromissos, avisos e conversas. Não tem volta.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Apagar', style: 'destructive', onPress: () => apagarTudo() },
          ])
        }
        style={[s.botao, { backgroundColor: '#3a1d1d' }]}
      >
        <Text style={[s.botaoTxt, { color: '#ff8a8a' }]}>Apagar toda a memória</Text>
      </Pressable>
      <Text style={s.cinza}>
        A fala vira texto no próprio iPhone; o áudio nunca sai do celular. Só o texto vai pra IA. A memória fica guardada
        só neste iPhone. No plano grátis do Gemini, o Google pode usar o texto enviado pra melhorar os produtos dele.
      </Text>
    </ScrollView>
  );
}

// ---------------- Estilo ----------------

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#0f1115' },
  topo: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  marca: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 2, marginRight: 10 },
  bolinha: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusTopo: { color: '#aaa', flex: 1 },
  conteudo: { flex: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  abas: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#22262e',
    paddingBottom: 26,
    paddingTop: 8,
    backgroundColor: '#14171c',
  },
  aba: { flex: 1, alignItems: 'center' },
  abaTxt: { color: '#888', fontSize: 12 },
  abaAtiva: { color: '#7cc4ff', fontWeight: '700' },
  botaoGrande: { borderRadius: 18, paddingVertical: 26, alignItems: 'center', marginBottom: 10 },
  botaoLigar: { backgroundColor: '#1f6feb' },
  botaoDesligar: { backgroundColor: '#3a3f47' },
  botaoGrandeTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  botao: { backgroundColor: '#1d2633', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginVertical: 10 },
  botaoTxt: { color: '#7cc4ff', fontSize: 16, fontWeight: '700' },
  cartao: { backgroundColor: '#171b22', borderRadius: 12, padding: 14, marginBottom: 10 },
  cartaoUrgente: { borderLeftWidth: 4, borderLeftColor: '#ff6b6b' },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  nome: { color: '#fff', fontSize: 16, fontWeight: '700' },
  texto: { color: '#e6e6e6', fontSize: 15, lineHeight: 21 },
  transcricao: { marginTop: 8, color: '#b9b9b9', fontSize: 14 },
  cinza: { color: '#8a8f98', fontSize: 13, marginVertical: 4 },
  erro: { color: '#ff8a8a', fontSize: 13, marginVertical: 4 },
  dica: { color: '#e3c26b', fontSize: 13, marginVertical: 4 },
  link: { color: '#7cc4ff', marginTop: 8, fontWeight: '600' },
  rotulo: { color: '#aaa', fontSize: 13, marginBottom: 4 },
  input: {
    backgroundColor: '#171b22',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 6,
    textAlignVertical: 'top',
  },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
});
