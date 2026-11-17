// Ouvido do NOA: reconhecimento de fala contínuo, ao vivo, no próprio iPhone.
// - Tudo o que é falado vira texto na hora (o áudio não sai do celular).
// - Quando alguém diz "NOA", o que vem depois vira um pedido e ele responde na hora.
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

type Eventos = {
  /** Uma frase terminou (pausa na fala). */
  aoTexto: (frase: string, quando: number) => void;
  /** Texto parcial, enquanto a pessoa ainda fala (para mostrar na tela). */
  aoParcial: (texto: string) => void;
  /** Chamaram o NOA. comando vazio = só disseram "NOA". */
  aoChamado: (comando: string, conversaRecente: string) => void;
  aoMudarStatus: (status: string) => void;
  aoFalhar: (mensagem: string) => void;
};

// "NOA", "Noá", "Noah", "Nôa"... no começo ou no meio da frase.
const PALAVRA = /(?:^|[^a-zà-ú])(n[oóô][aá]h?)(?=$|[^a-zà-ú])[\s,.:;!?-]*(.*)$/i;

export class Ouvido {
  private ev: Eventos;
  private ativo = false;
  private rodando = false;
  private noAparelho = true;
  private subs: { remove: () => void }[] = [];
  private transcricao = '';
  private comprometido = 0;
  private zerarNoProximo = false;
  private timerSilencio: ReturnType<typeof setTimeout> | null = null;
  private timerReinicio: ReturnType<typeof setTimeout> | null = null;
  private falhas = 0;
  private falando = false;
  private esperandoComandoAte = 0;
  private conversaSemNome = true;
  private recentes: { t: number; texto: string }[] = [];

  constructor(ev: Eventos) {
    this.ev = ev;
  }

  get ligado(): boolean {
    return this.ativo;
  }

  get modo(): string {
    return this.noAparelho ? 'no iPhone' : 'pelos servidores da Apple';
  }

  async ligar(opcoes: { conversaSemNome: boolean }): Promise<void> {
    this.conversaSemNome = opcoes.conversaSemNome;
    if (this.ativo) return;
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) throw new Error('Libere o microfone e o reconhecimento de fala para o NOA nos Ajustes do iPhone.');

    // Prefere reconhecer no próprio aparelho (grátis, sem limite diário e sem mandar áudio pra fora).
    this.noAparelho = false;
    try {
      const locais: any = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      const instalados: string[] = locais?.installedLocales ?? [];
      this.noAparelho = instalados.some((l) => l.toLowerCase().replace('_', '-').startsWith('pt-br'));
    } catch {}
    if (!this.noAparelho) {
      try {
        this.noAparelho = !!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      } catch {}
    }

    this.subs.push(ExpoSpeechRecognitionModule.addListener('start', () => this.aoIniciar()));
    this.subs.push(ExpoSpeechRecognitionModule.addListener('result', (e: any) => this.aoResultado(e)));
    this.subs.push(ExpoSpeechRecognitionModule.addListener('end', () => this.aoTerminar()));
    this.subs.push(ExpoSpeechRecognitionModule.addListener('error', (e: any) => this.aoErro(e)));
    this.ativo = true;
    this.falhas = 0;
    this.iniciar();
  }

  desligar(): void {
    this.ativo = false;
    this.limparTimers();
    this.fecharFrase();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.rodando = false;
    this.ev.aoMudarStatus('Desligado');
  }

  /** Quando o app volta para a tela: religa se o sistema tiver parado. */
  verificar(): void {
    if (this.ativo && !this.rodando && !this.timerReinicio) this.iniciar();
  }

  /** Enquanto o NOA fala, ignora o que o microfone ouve (para ele não ouvir a si mesmo). */
  definirFalando(falando: boolean): void {
    this.falando = falando;
    if (falando) {
      this.limparSilencio();
      this.comprometido = this.transcricao.length;
    } else {
      this.comprometido = this.transcricao.length;
      // Depois de responder, dá alguns segundos para continuar a conversa sem repetir "NOA".
      if (this.conversaSemNome) this.esperandoComandoAte = Date.now() + 8000;
    }
  }

  // ---------------- interno ----------------

  private iniciar(): void {
    this.timerReinicio = null;
    if (!this.ativo) return;
    this.transcricao = '';
    this.comprometido = 0;
    this.zerarNoProximo = false;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: this.noAparelho,
        addsPunctuation: true,
        contextualStrings: ['NOA', 'Noa'],
        iosTaskHint: 'dictation',
        iosVoiceProcessingEnabled: true,
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetoothA2DP', 'mixWithOthers'],
          mode: 'default',
        },
      } as any);
    } catch (e: any) {
      this.reagendar(String(e?.message ?? e));
    }
  }

  private aoIniciar(): void {
    this.rodando = true;
    this.ev.aoMudarStatus(`Ouvindo (${this.modo})`);
  }

  private aoResultado(e: any): void {
    const t: string = e?.results?.[0]?.transcript ?? '';
    this.falhas = 0;
    if (this.zerarNoProximo) {
      this.comprometido = 0;
      this.zerarNoProximo = false;
    }
    if (t.length < this.comprometido) this.comprometido = 0; // o reconhecedor recomeçou o texto
    this.transcricao = t;

    if (this.falando) {
      this.comprometido = t.length;
      return;
    }
    this.ev.aoParcial(t.slice(this.comprometido).trim());

    if (e?.isFinal) {
      this.fecharFrase();
      this.zerarNoProximo = true;
      return;
    }
    this.limparSilencio();
    this.timerSilencio = setTimeout(() => this.fecharFrase(), 900);
  }

  private fecharFrase(): void {
    this.limparSilencio();
    const frase = this.transcricao.slice(this.comprometido).trim();
    this.comprometido = this.transcricao.length;
    if (!frase) return;
    this.ev.aoParcial('');

    const agora = Date.now();
    this.recentes.push({ t: agora, texto: frase });
    this.recentes = this.recentes.filter((r) => agora - r.t < 10 * 60_000);
    this.ev.aoTexto(frase, agora);

    const m = frase.match(PALAVRA);
    if (m) {
      const comando = (m[2] ?? '').trim();
      if (comando.split(/\s+/).filter(Boolean).length >= 2) {
        this.esperandoComandoAte = 0;
        this.ev.aoChamado(comando, this.conversaRecente());
      } else {
        // Só chamou "NOA": responde rápido e espera o pedido na próxima frase.
        this.esperandoComandoAte = agora + 9000;
        this.ev.aoChamado('', this.conversaRecente());
      }
      return;
    }
    if (agora < this.esperandoComandoAte) {
      this.esperandoComandoAte = 0;
      this.ev.aoChamado(frase, this.conversaRecente());
    }
  }

  private conversaRecente(): string {
    const agora = Date.now();
    return this.recentes
      .filter((r) => agora - r.t < 5 * 60_000)
      .map((r) => r.texto)
      .join('\n');
  }

  private aoTerminar(): void {
    this.rodando = false;
    this.fecharFrase();
    if (this.ativo) {
      this.ev.aoMudarStatus('Religando...');
      this.reagendar();
    }
  }

  private aoErro(e: any): void {
    const codigo = String(e?.error ?? '');
    if (codigo === 'aborted' || codigo === 'no-speech') return; // normal; o "end" religa
    if (codigo === 'not-allowed' || codigo === 'service-not-allowed') {
      this.ev.aoFalhar('NOA ficou sem permissão de microfone/fala. Libera nos Ajustes do iPhone.');
      this.desligar();
      return;
    }
    if (codigo === 'language-not-supported') {
      this.noAparelho = false; // tenta pelo servidor da Apple
    }
    this.reagendar(e?.message ?? codigo);
  }

  private reagendar(motivo?: string): void {
    if (!this.ativo || this.timerReinicio) return;
    this.falhas++;
    if (this.falhas === 5) {
      this.ev.aoFalhar('NOA parou de ouvir. Abre o app pra ele voltar.');
    }
    if (motivo && this.falhas > 2) this.ev.aoMudarStatus(`Tentando religar (${motivo})`);
    const espera = this.falhas <= 2 ? 400 : Math.min(30_000, 2000 * this.falhas);
    this.timerReinicio = setTimeout(() => this.iniciar(), espera);
  }

  private limparSilencio(): void {
    if (this.timerSilencio) clearTimeout(this.timerSilencio);
    this.timerSilencio = null;
  }

  private limparTimers(): void {
    this.limparSilencio();
    if (this.timerReinicio) clearTimeout(this.timerReinicio);
    this.timerReinicio = null;
  }
}
