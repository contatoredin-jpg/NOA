import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
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
import { conversar, resumoDoDia } from './src/ia';
import {
  agendarResumoNoturno,
  avisarAgora,
  configurarVoz,
  falar,
  listarVozes,
  nomeQualidade,
  pararFala,
  pedirPermissaoAvisos,
} from './src/avisos';
import type { Voz } from './src/avisos';

// ---------------- Visual ----------------

const C = {
  fundo: '#04050d',
  painel: 'rgba(16, 20, 44, 0.92)',
  borda: 'rgba(0, 229, 255, 0.22)',
  ciano: '#00e5ff',
  roxo: '#7c4dff',
  magenta: '#ff2bd6',
  verde: '#3dffb5',
  texto: '#e8ecff',
  cinza: '#8a90b8',
  erro: '#ff6b8a',
};

const CEREBRO = require('./assets/cerebro.png');

type Estado = 'desligado' | 'ouvindo' | 'pensando' | 'falando';
const COR_ESTADO: Record<Estado, string> = {
  desligado: '#3a4170',
  ouvindo: C.ciano,
  pensando: C.magenta,
  falando: C.verde,
};
const TEXTO_ESTADO: Record<Estado, string> = {
  desligado: 'Desligado',
  ouvindo: 'Ouvindo',
  pensando: 'Pensando',
  falando: 'Falando',
};

type Aba = 'inicio' | 'conversar' | 'pessoas' | 'agenda' | 'diario' | 'ajustes';
const ABAS: { id: Aba; nome: string; icone: string }[] = [
  { id: 'inicio', nome: 'Início', icone: '◉' },
  { id: 'conversar', nome: 'Conversar', icone: '✦' },
  { id: 'pessoas', nome: 'Pessoas', icone: '◎' },
  { id: 'agenda', nome: 'Agenda', icone: '◷' },
  { id: 'diario', nome: 'Diário', icone: '▤' },
  { id: 'ajustes', nome: 'Ajustes', icone: '⚙' },
];

const OI = ['Fala!', 'Oi, tô aqui.', 'Diz aí.', 'Opa, fala.', 'Pode falar.'];

const fmt = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------------- App ----------------

export default function App() {
  const ouvidoRef = useRef<Ouvido | null>(null);
  const [aba, setAba] = useState<Aba>('inicio');
  const [status, setStatus] = useState('Desligado');
  const [ligado, setLigado] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [falando, setFalando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [cerebro, setCerebro] = useState(estadoCerebro());
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [versao, setVersao] = useState(0);

  const estado: Estado = !ligado ? (falando ? 'falando' : pensando ? 'pensando' : 'desligado')
    : falando ? 'falando' : pensando ? 'pensando' : 'ouvindo';

  // Fala e avisa o ouvido para não ouvir a própria voz.
  const dizer = useCallback((texto: string) => {
    falar(texto, (f) => {
      setFalando(f);
      ouvidoRef.current?.definirFalando(f);
    });
  }, []);

  const responder = useCallback(
    async (comando: string, recente: string) => {
      if (!comando) {
        dizer(OI[Math.floor(Math.random() * OI.length)]);
        return;
      }
      setPensando(true);
      try {
        const cfg = await lerAjustes();
        const r = await conversar(cfg, comando, recente, await contextoMemoria(true));
        setPensando(false);
        dizer(r);
        salvarConversa(comando, r).then(() => setVersao((v) => v + 1));
      } catch (e: any) {
        setPensando(false);
        dizer('Xi, não consegui pensar agora. Tô sem internet ou a IA travou.');
        avisarAgora('NOA', 'Erro ao responder: ' + (e?.message ?? e));
      }
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
    lerAjustes().then((a) => {
      setAjustes(a);
      configurarVoz(a);
    });
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
    if (!cfg.apiKey && !cfg.openaiKey) {
      Alert.alert('Falta a chave', 'Coloca a chave da IA em Ajustes antes de ligar.');
      setAba('ajustes');
      return;
    }
    try {
      await pedirPermissaoAvisos();
      await agendarResumoNoturno(cfg.horaResumo);
      await configurarVoz(cfg);
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
      <View style={s.brilhoTopo} pointerEvents="none" />
      <View style={s.topo}>
        <Image source={CEREBRO} style={s.logoMini} />
        <Text style={s.marca}>NOA</Text>
        <View style={[s.chip, { borderColor: COR_ESTADO[estado] }]}>
          <View style={[s.bolinha, { backgroundColor: COR_ESTADO[estado], shadowColor: COR_ESTADO[estado] }]} />
          <Text style={[s.chipTxt, { color: COR_ESTADO[estado] }]}>{TEXTO_ESTADO[estado]}</Text>
        </View>
      </View>

      <View style={s.conteudo}>
        {aba === 'inicio' && (
          <Inicio
            estado={estado}
            ligado={ligado}
            status={status}
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
        {aba === 'ajustes' && (
          <AjustesTela
            inicial={ajustes}
            aoSalvar={(a) => {
              setAjustes(a);
              configurarVoz(a);
            }}
          />
        )}
      </View>

      <View style={s.abas}>
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          return (
            <Pressable key={a.id} onPress={() => setAba(a.id)} style={s.aba}>
              <Text style={[s.abaIcone, ativa && s.abaAtiva]}>{a.icone}</Text>
              <Text style={[s.abaTxt, ativa && s.abaAtiva]}>{a.nome}</Text>
              {ativa && <View style={s.abaLinha} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------- Cérebro animado ----------------

function CerebroVivo({ estado, aoTocar }: { estado: Estado; aoTocar: () => void }) {
  const pulso = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulso.stopAnimation();
    pulso.setValue(0);
    const duracao = estado === 'pensando' ? 600 : estado === 'falando' ? 420 : estado === 'ouvindo' ? 1600 : 3200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [estado]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(giro, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const cor = COR_ESTADO[estado];
  const ativo = estado !== 'desligado';
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, ativo ? 1.06 : 1.02] });
  const anel1 = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const anel2 = pulso.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1.32] });
  const opac1 = pulso.interpolate({ inputRange: [0, 1], outputRange: [ativo ? 0.7 : 0.25, 0.15] });
  const opac2 = pulso.interpolate({ inputRange: [0, 1], outputRange: [ativo ? 0.4 : 0.12, 0] });
  const rot = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Pressable onPress={aoTocar} style={s.cerebroArea}>
      <Animated.View style={[s.anel, { borderColor: cor, opacity: opac2, transform: [{ scale: anel2 }] }]} />
      <Animated.View style={[s.anel, { borderColor: cor, opacity: opac1, transform: [{ scale: anel1 }] }]} />
      <Animated.View style={[s.anelHud, { borderColor: cor, transform: [{ rotate: rot }] }]} />
      <Animated.View
        style={[s.halo, { backgroundColor: cor, shadowColor: cor, opacity: ativo ? 0.16 : 0.06, transform: [{ scale: escala }] }]}
      />
      <Animated.Image
        source={CEREBRO}
        style={[s.cerebroImg, { opacity: ativo ? 1 : 0.55, transform: [{ scale: escala }] }]}
        resizeMode="contain"
      />
    </Pressable>
  );
}

// ---------------- Telas ----------------

function Inicio(p: {
  estado: Estado;
  ligado: boolean;
  status: string;
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
    listarAvisos(8).then(setAvisos);
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

  const legenda = !p.ligado
    ? 'Toque no cérebro para ligar'
    : p.estado === 'pensando'
    ? 'Pensando…'
    : p.estado === 'falando'
    ? 'Falando…'
    : 'Diga “NOA” e fale o que quiser';

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <CerebroVivo estado={p.estado} aoTocar={p.alternar} />
      <Text style={[s.legenda, { color: COR_ESTADO[p.estado] }]}>{legenda}</Text>
      {p.ligado && p.status && !p.status.startsWith('Ouvindo') && <Text style={s.cinzaCentro}>{p.status}</Text>}

      {p.ligado && (
        <View style={[s.cartao, s.cartaoAoVivo]}>
          <Text style={s.rotuloNeon}>AO VIVO</Text>
          <Text style={s.texto}>{p.parcial || '…'}</Text>
        </View>
      )}

      <View style={s.metricas}>
        <Metrica valor={p.cerebro.analisados} rotulo="na memória" cor={C.ciano} />
        <Metrica valor={p.cerebro.noBuffer} rotulo="palavras" cor={C.roxo} />
        <Metrica valor={p.cerebro.naFila} rotulo="na fila" cor={C.magenta} />
      </View>
      {!!p.cerebro.ultimoErro && <Text style={s.erro}>Último erro: {p.cerebro.ultimoErro}</Text>}
      {!p.ajustes.nome && <Text style={s.dica}>Coloca teu nome em Ajustes pro NOA te chamar pelo nome.</Text>}

      {conversas.length > 0 && <Text style={s.titulo}>Últimas conversas</Text>}
      {conversas.map((c) => (
        <View key={c.id} style={s.cartao}>
          <Text style={s.cinza}>
            {fmt(c.criado_em)} · você: {c.pedido}
          </Text>
          <Text style={s.texto}>{c.resposta}</Text>
        </View>
      ))}

      <BotaoNeon texto={carregando ? 'Pensando…' : 'Resumo de hoje'} onPress={gerarResumo} />
      {!!resumo && (
        <View style={s.cartao}>
          <Text style={s.texto}>{resumo}</Text>
          <Pressable onPress={() => p.dizer(resumo)}>
            <Text style={s.link}>▶ Ouvir</Text>
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

function Metrica({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <View style={[s.metrica, { borderColor: cor + '55', shadowColor: cor }]}>
      <Text style={[s.metricaValor, { color: cor, textShadowColor: cor }]}>{valor}</Text>
      <Text style={s.metricaRotulo}>{rotulo}</Text>
    </View>
  );
}

function BotaoNeon({ texto, onPress, cor = C.ciano }: { texto: string; onPress: () => void; cor?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.botao, { borderColor: cor, shadowColor: cor, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[s.botaoTxt, { color: cor, textShadowColor: cor }]}>{texto}</Text>
    </Pressable>
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
      salvarConversa(pedido, r);
      setResposta(r);
      if (lendo) dizer(r);
    } catch (e: any) {
      setResposta('Não consegui responder: ' + (e?.message ?? e));
    }
    setCarregando(false);
  };

  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.cinza}>Prefere escrever? Manda aqui. Com o NOA ligado, é só falar “NOA” em voz alta.</Text>
      <TextInput
        style={[s.input, { minHeight: 100 }]}
        multiline
        placeholder="Ex.: quem era o corretor que conheci ontem?"
        placeholderTextColor="#5d6390"
        value={pedido}
        onChangeText={setPedido}
      />
      <View style={s.linha}>
        <Text style={s.texto}>Ler a resposta em voz alta</Text>
        <Switch value={lendo} onValueChange={setLendo} trackColor={{ true: C.ciano }} />
      </View>
      <BotaoNeon texto={carregando ? 'Pensando…' : 'Mandar'} onPress={enviar} />
      {!!resposta && (
        <View style={s.cartao}>
          <Text style={s.texto}>{resposta}</Text>
          <Pressable onPress={pararFala}>
            <Text style={s.link}>■ Parar voz</Text>
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
        placeholderTextColor="#5d6390"
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
          <Text style={[s.nome, { color: C.ciano }]}>{c.quando ? c.quando.replace('T', ' às ') : 'Sem data'}</Text>
          <Text style={s.texto}>{c.descricao}</Text>
          {!!c.quem && <Text style={s.cinza}>Quem prometeu: {c.quem}</Text>}
          <Pressable
            onPress={async () => {
              await marcarFeito(c.id);
              setV((x) => x + 1);
            }}
          >
            <Text style={s.link}>✓ Marcar como feito</Text>
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

function Ajustador({
  rotulo,
  valor,
  passo,
  min,
  max,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  passo: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
}) {
  const mudar = (d: number) => aoMudar(Math.round(Math.min(max, Math.max(min, valor + d)) * 100) / 100);
  return (
    <View style={s.linha}>
      <Text style={s.texto}>{rotulo}</Text>
      <View style={s.ajustador}>
        <Pressable onPress={() => mudar(-passo)} style={s.ajBotao}>
          <Text style={s.ajTxt}>–</Text>
        </Pressable>
        <Text style={s.ajValor}>{valor.toFixed(2)}</Text>
        <Pressable onPress={() => mudar(passo)} style={s.ajBotao}>
          <Text style={s.ajTxt}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AjustesTela({ inicial, aoSalvar }: { inicial: Ajustes; aoSalvar: (a: Ajustes) => void }) {
  const [a, setA] = useState<Ajustes>(inicial);
  const [vozes, setVozes] = useState<Voz[]>([]);
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    listarVozes().then(setVozes);
  }, []);

  const num = (txt: string, padrao: number) => {
    const n = Number(txt.replace(',', '.'));
    return isNaN(n) ? padrao : n;
  };
  const salvar = async () => {
    const limpo: Ajustes = {
      ...a,
      apiKey: a.apiKey.trim(),
      openaiKey: a.openaiKey.trim(),
      modelo: a.modelo.trim() || AJUSTES_PADRAO.modelo,
      modeloRapido: a.modeloRapido.trim() || AJUSTES_PADRAO.modeloRapido,
      modeloOpenai: a.modeloOpenai.trim() || AJUSTES_PADRAO.modeloOpenai,
      jeito: a.jeito.trim() || AJUSTES_PADRAO.jeito,
    };
    await salvarAjustes(limpo);
    await agendarResumoNoturno(limpo.horaResumo);
    aoSalvar(limpo);
    Alert.alert('Fechou', 'Ajustes salvos. Se o NOA estiver ligado, desliga e liga de novo pra valer tudo.');
  };
  const testarVoz = (id: string) =>
    falar(`Fala${a.nome ? ', ' + a.nome : ''}! Eu sou o NOA. Essa é a minha voz.`, undefined, {
      voz: id || undefined,
      velocidade: a.velocidade,
      tom: a.tom,
    });

  const campo = (rotulo: string, valor: string, mudar: (t: string) => void, extra: any = {}) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <TextInput style={s.input} value={valor} onChangeText={mudar} placeholderTextColor="#5d6390" {...extra} />
    </View>
  );
  const vozesMostradas = verTodas ? vozes : vozes.slice(0, 8);

  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.secao}>VOCÊ</Text>
      {campo('Seu nome', a.nome, (t) => setA({ ...a, nome: t }))}
      {campo('Jeito de falar do NOA', a.jeito, (t) => setA({ ...a, jeito: t }), {
        multiline: true,
        style: [s.input, { minHeight: 90 }],
      })}

      <Text style={s.secao}>VOZ DO NOA</Text>
      <View style={[s.cartao, s.cartaoDica]}>
        <Text style={s.textoPeq}>
          Pra uma voz bem mais natural, baixe uma voz Premium ou Aprimorada no iPhone: Ajustes → Acessibilidade → Conteúdo
          Falado → Vozes → Português (Brasil). Depois volte aqui e escolha.
        </Text>
      </View>
      <Pressable onPress={() => setA({ ...a, voz: '' })} style={[s.voz, !a.voz && s.vozAtiva]}>
        <View style={{ flex: 1 }}>
          <Text style={s.nome}>Automática</Text>
          <Text style={s.cinza}>A melhor voz em português instalada</Text>
        </View>
        <Pressable onPress={() => testarVoz('')} style={s.play}>
          <Text style={s.playTxt}>▶</Text>
        </Pressable>
      </Pressable>
      {vozesMostradas.map((v) => (
        <Pressable key={v.id} onPress={() => setA({ ...a, voz: v.id })} style={[s.voz, a.voz === v.id && s.vozAtiva]}>
          <View style={{ flex: 1 }}>
            <Text style={s.nome}>{v.nome}</Text>
            <Text style={s.cinza}>
              {v.idioma} · {nomeQualidade(v.qualidade)}
            </Text>
          </View>
          <Pressable onPress={() => testarVoz(v.id)} style={s.play}>
            <Text style={s.playTxt}>▶</Text>
          </Pressable>
        </Pressable>
      ))}
      {vozes.length > 8 && (
        <Pressable onPress={() => setVerTodas(!verTodas)}>
          <Text style={s.link}>{verTodas ? 'Mostrar menos' : `Ver todas as ${vozes.length} vozes`}</Text>
        </Pressable>
      )}
      <Ajustador rotulo="Velocidade" valor={a.velocidade} passo={0.05} min={0.5} max={1.6} aoMudar={(v) => setA({ ...a, velocidade: v })} />
      <Ajustador rotulo="Tom" valor={a.tom} passo={0.05} min={0.5} max={2} aoMudar={(v) => setA({ ...a, tom: v })} />

      <Text style={s.secao}>INTELIGÊNCIA</Text>
      <Text style={s.rotulo}>Quem responde quando você chama o NOA</Text>
      <View style={s.escolha}>
        <Pressable
          onPress={() => setA({ ...a, provedor: 'gemini' })}
          style={[s.opcao, a.provedor === 'gemini' && { borderColor: C.ciano, backgroundColor: 'rgba(0,229,255,0.1)' }]}
        >
          <Text style={[s.nome, a.provedor === 'gemini' && { color: C.ciano }]}>Gemini</Text>
          <Text style={s.cinza}>Grátis · mais rápido</Text>
        </Pressable>
        <Pressable
          onPress={() => setA({ ...a, provedor: 'openai' })}
          style={[s.opcao, a.provedor === 'openai' && { borderColor: C.magenta, backgroundColor: 'rgba(255,43,214,0.1)' }]}
        >
          <Text style={[s.nome, a.provedor === 'openai' && { color: C.magenta }]}>GPT-6 Astra</Text>
          <Text style={s.cinza}>Pago por uso · OpenAI</Text>
        </Pressable>
      </View>
      {campo('Chave do Gemini (aistudio.google.com)', a.apiKey, (t) => setA({ ...a, apiKey: t }), {
        secureTextEntry: true,
        autoCapitalize: 'none',
        autoCorrect: false,
        placeholder: 'Cola aqui',
      })}
      {a.provedor === 'openai' &&
        campo('Chave da OpenAI (platform.openai.com)', a.openaiKey, (t) => setA({ ...a, openaiKey: t }), {
          secureTextEntry: true,
          autoCapitalize: 'none',
          autoCorrect: false,
          placeholder: 'sk-...',
        })}
      {a.provedor === 'openai' &&
        campo('Modelo da OpenAI', a.modeloOpenai, (t) => setA({ ...a, modeloOpenai: t }), {
          autoCapitalize: 'none',
          autoCorrect: false,
        })}
      {campo('Modelo Gemini da conversa (rápido)', a.modeloRapido, (t) => setA({ ...a, modeloRapido: t }), {
        autoCapitalize: 'none',
        autoCorrect: false,
      })}
      {campo('Modelo Gemini da memória', a.modelo, (t) => setA({ ...a, modelo: t }), {
        autoCapitalize: 'none',
        autoCorrect: false,
      })}

      <Text style={s.secao}>ROTINA</Text>
      {campo('Guardar na memória a cada (minutos)', String(a.trechoMin), (t) =>
        setA({ ...a, trechoMin: Math.max(1, num(t, 5)) }), { keyboardType: 'numeric' })}
      {campo('Hora do resumo da noite (0–23)', String(a.horaResumo), (t) =>
        setA({ ...a, horaResumo: Math.min(23, Math.max(0, Math.round(num(t, 21)))) }), { keyboardType: 'numeric' })}
      <View style={s.linha}>
        <Text style={[s.texto, { flex: 1 }]}>Continuar a conversa sem repetir “NOA” (8 s)</Text>
        <Switch value={a.conversaSemNome} onValueChange={(v) => setA({ ...a, conversaSemNome: v })} trackColor={{ true: C.ciano }} />
      </View>
      <View style={s.linha}>
        <Text style={[s.texto, { flex: 1 }]}>Falar avisos urgentes em voz alta</Text>
        <Switch value={a.falarAvisos} onValueChange={(v) => setA({ ...a, falarAvisos: v })} trackColor={{ true: C.ciano }} />
      </View>

      <BotaoNeon texto="Salvar" onPress={salvar} />
      <BotaoNeon
        texto="Apagar toda a memória"
        cor={C.erro}
        onPress={() =>
          Alert.alert('Apagar tudo?', 'Apaga pessoas, diário, compromissos, avisos e conversas. Não tem volta.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Apagar', style: 'destructive', onPress: () => apagarTudo() },
          ])
        }
      />
      <Text style={s.cinza}>
        A fala vira texto no próprio iPhone; o áudio nunca sai do celular. Só o texto vai pra IA. A memória fica guardada
        só neste iPhone. No plano grátis do Gemini, o Google pode usar o texto enviado pra melhorar os produtos dele. O
        GPT-6 Astra é cobrado por uso na sua conta da OpenAI.
      </Text>
    </ScrollView>
  );
}

// ---------------- Estilo ----------------

const brilho = (cor: string, raio = 12) => ({
  shadowColor: cor,
  shadowOpacity: 0.8,
  shadowRadius: raio,
  shadowOffset: { width: 0, height: 0 },
});

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: C.fundo },
  brilhoTopo: {
    position: 'absolute',
    top: -180,
    left: -60,
    right: -60,
    height: 360,
    borderRadius: 400,
    backgroundColor: 'rgba(124, 77, 255, 0.12)',
  },
  topo: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' },
  logoMini: { width: 34, height: 34, marginRight: 8 },
  marca: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
    flex: 1,
    textShadowColor: C.ciano,
    textShadowRadius: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipTxt: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  bolinha: { width: 8, height: 8, borderRadius: 4, marginRight: 6, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  conteudo: { flex: 1 },
  pad: { padding: 16, paddingBottom: 48 },

  cerebroArea: { alignSelf: 'center', width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  anel: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 2 },
  anelHud: {
    position: 'absolute',
    width: 272,
    height: 272,
    borderRadius: 136,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.45,
  },
  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, shadowOpacity: 1, shadowRadius: 50, shadowOffset: { width: 0, height: 0 } },
  cerebroImg: { width: 250, height: 250 },
  legenda: { textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: 0.5, marginTop: 6, marginBottom: 4 },
  cinzaCentro: { color: C.cinza, fontSize: 12, textAlign: 'center', marginBottom: 4 },

  metricas: { flexDirection: 'row', gap: 10, marginVertical: 12 },
  metrica: {
    flex: 1,
    backgroundColor: C.painel,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  metricaValor: { fontSize: 22, fontWeight: '900', textShadowRadius: 10 },
  metricaRotulo: { color: C.cinza, fontSize: 11, marginTop: 2 },

  abas: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,229,255,0.15)',
    paddingBottom: 26,
    paddingTop: 8,
    backgroundColor: '#070917',
  },
  aba: { flex: 1, alignItems: 'center' },
  abaIcone: { color: '#4a5080', fontSize: 16, marginBottom: 2 },
  abaTxt: { color: '#5d6390', fontSize: 10.5 },
  abaAtiva: { color: C.ciano, fontWeight: '700', textShadowColor: C.ciano, textShadowRadius: 8 },
  abaLinha: { marginTop: 4, width: 18, height: 2, borderRadius: 1, backgroundColor: C.ciano, ...brilho(C.ciano, 6) },

  botao: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  botaoTxt: { fontSize: 15, fontWeight: '800', letterSpacing: 1, textShadowRadius: 8 },

  cartao: {
    backgroundColor: C.painel,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.borda,
  },
  cartaoAoVivo: { borderColor: 'rgba(0,229,255,0.45)', ...brilho(C.ciano, 8), shadowOpacity: 0.3 },
  cartaoUrgente: { borderColor: 'rgba(255,107,138,0.7)', ...brilho(C.erro, 8), shadowOpacity: 0.4 },
  cartaoDica: { borderColor: 'rgba(124,77,255,0.5)' },
  rotuloNeon: { color: C.ciano, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  secao: { color: C.roxo, fontSize: 12, fontWeight: '900', letterSpacing: 3, marginTop: 18, marginBottom: 10 },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  nome: { color: '#fff', fontSize: 16, fontWeight: '700' },
  texto: { color: C.texto, fontSize: 15, lineHeight: 21 },
  textoPeq: { color: C.texto, fontSize: 13, lineHeight: 19 },
  transcricao: { marginTop: 8, color: '#aab0d8', fontSize: 14 },
  cinza: { color: C.cinza, fontSize: 13, marginVertical: 3 },
  erro: { color: C.erro, fontSize: 13, marginVertical: 4 },
  dica: { color: '#ffd36b', fontSize: 13, marginVertical: 4 },
  link: { color: C.ciano, marginTop: 8, fontWeight: '700' },
  rotulo: { color: C.cinza, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(16,20,44,0.95)',
    color: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.35)',
    textAlignVertical: 'top',
  },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },

  voz: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.painel,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  vozAtiva: { borderColor: C.ciano, ...brilho(C.ciano, 8), shadowOpacity: 0.35 },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.magenta,
    alignItems: 'center',
    justifyContent: 'center',
    ...brilho(C.magenta, 8),
    shadowOpacity: 0.5,
  },
  playTxt: { color: C.magenta, fontSize: 15, marginLeft: 2 },
  ajustador: { flexDirection: 'row', alignItems: 'center' },
  ajBotao: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.ciano,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ajTxt: { color: C.ciano, fontSize: 20, fontWeight: '700' },
  ajValor: { color: '#fff', width: 56, textAlign: 'center', fontWeight: '700' },
  escolha: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  opcao: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 12,
    backgroundColor: C.painel,
  },
});
