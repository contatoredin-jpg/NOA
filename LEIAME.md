# NOA — protótipo grátis

O NOA fica ouvindo pelo iPhone. Quando você diz **"NOA"**, ele responde na hora, falando, do seu jeito. O resto do tempo, ele guarda pessoas, compromissos, fatos e o diário do seu dia.

## Como conversar com ele
- **"NOA, quem é o cara que eu conheci ontem na obra?"** Ele responde direto.
- **"NOA"** sozinho: ele diz "Fala!" e espera o seu pedido na próxima frase.
- Depois que ele responde, você tem **8 segundos** para continuar sem repetir "NOA". Dá pra desligar isso em Ajustes.
- O **jeito de falar** dele dá pra mudar em Ajustes. Já vem coloquial, como amigo, e ele copia o jeito que você fala.
- Prefere escrever? Use a aba **Conversar**.

## O que mais ele faz
- **Ouve ao vivo:** a fala vira texto no próprio iPhone, e o áudio nunca sai do celular.
- **Guarda na memória:** a cada 5 minutos, manda o texto do que ouviu para a IA (Gemini, plano grátis). A IA monta as fichas:
  - pessoas
  - compromissos com data, que viram lembrete 30 minutos antes
  - fatos
  - avisos, quando vale se intrometer
- **Descarta o que não é com você:** TV, música e conversa alheia.
- **Resumo do dia:** lembrete diário às 21h.
- **Tudo guardado só no seu iPhone.**

---

## Passo a passo (tudo grátis)

### 1. Pegue a chave da IA (2 minutos)
1. Entre em **aistudio.google.com** com sua conta Google.
2. Clique em **Get API key**, depois em **Create API key**.
3. Copie a chave e guarde.

### 2. Coloque o código no GitHub (10 minutos, no PC)
1. Crie uma conta em **github.com**.
2. Clique em **New repository**, dê o nome `noa` e marque **Public**. A máquina Mac grátis só vale para repositório público, e o código não tem nenhuma senha sua.
3. Na página do repositório, clique em **uploading an existing file**.
4. Descompacte o zip e arraste **todo o conteúdo da pasta `noa`**, inclusive a pasta `.github`. Clique em **Commit changes**.

> Se a pasta `.github` não aparecer no Windows: Explorador de Arquivos → Exibir → Itens ocultos.

### 3. Compile o app (automático, 20 a 40 minutos)
1. Abra a aba **Actions**. A compilação "Compilar NOA (iPhone)" começa sozinha.
2. Quando ficar verde ✅, clique nela e baixe **NOA-ipa** em *Artifacts*.
3. Descompacte. Dentro está o **NOA.ipa**.

Se ficar vermelho ❌, abra o passo com erro, copie as últimas linhas e me mande.

### 4. Prepare o iPhone e o PC (uma vez só)
1. No PC, instale o **iTunes** e o **iCloud** baixados do site da Apple (não da Microsoft Store), depois o **AltServer** de **altstore.io**. Siga o guia do site para instalar o **AltStore** no iPhone.
2. No iPhone, ative o **Modo de Desenvolvedor**: Ajustes → Privacidade e Segurança → Modo de Desenvolvedor.
3. Para ele reconhecer a fala sem internet e sem limite diário, deixe o **português (Brasil)** baixado para ditado: Ajustes → Geral → Teclado → Ditado ativado, com o teclado em português.

### 5. Instale o NOA
1. Mande o `NOA.ipa` para o iPhone (iCloud Drive, ou e-mail para você mesmo, salvando em Arquivos).
2. Abra o **AltStore** → **My Apps** → **+** → escolha o `NOA.ipa`.
3. Se pedir: Ajustes → Geral → VPN e Gerenciamento de Dispositivo → confiar.

### 6. Comece a usar
1. Abra o NOA → **Ajustes** → coloque seu nome, cole a chave → **Salvar**.
2. **Início** → **Ligar o NOA** → permita o microfone, o reconhecimento de fala e as notificações.
3. Ele diz "Tô ligado". Agora é só chamar: **"NOA, ..."**

No topo da tela aparece **"Ouvindo (no iPhone)"** ou **"(pelos servidores da Apple)"**. "No iPhone" é o ideal.

---

## Chatices desta versão grátis
- **Vence a cada 7 dias:** deixe o AltServer aberto no PC. Com o iPhone no mesmo Wi-Fi, o AltStore renova sozinho.
- **Tela bloqueada:** a Apple não garante que o reconhecimento de fala continue com a tela bloqueada. Ele tenta religar sozinho. Se parar, manda notificação para você abrir o app. **Isso é o primeiro teste a fazer.**
- **Ligações e Siri** pausam a escuta. Depois, ele volta sozinho.
- **Sem fone, ele fala pelo alto-falante.** Com fone, só você ouve.
- **Quem está falando:** a transcrição não separa as vozes. A IA deduz pelo contexto.
- **Nome parecido:** se alguém perto falar "Noa" ou "Noah", ele pode achar que é com ele.
- **Limite do Gemini grátis:** se passar, o texto espera na fila e é enviado mais tarde.
- **Privacidade:** no plano grátis, o Google pode usar o texto enviado para melhorar os produtos dele. O áudio nunca é enviado.
