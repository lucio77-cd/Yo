// ===========================================================
// simulador.js — motor de duelo simplificado (só monstros)
// Regras cobertas: invocar em ataque/defesa, atacar, combate,
// dano direto, dano de combate, fases do turno.
// ===========================================================

const ZONAS = 3; // zonas de monstro por lado, pra caber na tela

let estado = null;

async function carregarCartas() {
  const res = await fetch("cartas.json");
  return res.json();
}

function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function montarDeck(cartasBase) {
  // 2 cópias de cada carta = 24 cartas, baralhado
  return embaralhar([...cartasBase, ...cartasBase]).map((c, i) => ({
    ...c,
    uid: `${c.id}-${i}-${Math.random().toString(36).slice(2, 7)}`,
  }));
}

async function iniciarJogo() {
  const base = await carregarCartas();

  estado = {
    lp: { jogador: 8000, ia: 8000 },
    deck: { jogador: montarDeck(base), ia: montarDeck(base) },
    mao: { jogador: [], ia: [] },
    cemiterio: { jogador: [], ia: [] },
    campo: {
      jogador: Array(ZONAS).fill(null),
      ia: Array(ZONAS).fill(null),
    },
    turno: "jogador",
    fase: "main1", // main1 | batalha | fim
    invocouEsteTurno: false,
    ataqueSelecionado: null, // índice da zona atacante aguardando alvo
    log: [],
    fimDeJogo: null,
  };

  for (let i = 0; i < 5; i++) {
    comprar("jogador");
    comprar("ia");
  }

  registrar("Duelo iniciado. Cada um comprou 5 cartas. Seu turno — Fase Principal 1.");
  render();
}

function comprar(lado) {
  const carta = estado.deck[lado].shift();
  if (!carta) {
    // baralho vazio: derrota por deck-out
    encerrarJogo(lado === "jogador" ? "ia" : "jogador", "o baralho acabou");
    return;
  }
  estado.mao[lado].push(carta);
}

function registrar(msg) {
  estado.log.unshift(msg);
  if (estado.log.length > 40) estado.log.pop();
}

// ---------- ações do jogador ----------

function invocar(idxMao, posicao) {
  if (estado.turno !== "jogador" || (estado.fase !== "main1" && estado.fase !== "main2")) return;
  if (estado.invocouEsteTurno) {
    registrar("Você só pode fazer uma invocação normal por turno.");
    render();
    return;
  }
  const zonaLivre = estado.campo.jogador.findIndex((z) => z === null);
  if (zonaLivre === -1) {
    registrar("Seu campo de monstros está cheio (3/3).");
    render();
    return;
  }
  const carta = estado.mao.jogador.splice(idxMao, 1)[0];
  estado.campo.jogador[zonaLivre] = {
    ...carta,
    pos: posicao, // 'atk' | 'def'
    faceDown: posicao === "def",
    atacou: false,
  };
  estado.invocouEsteTurno = true;

  if (posicao === "atk") {
    registrar(`Você invocou ${carta.nome} (${carta.atk} ATK) em modo de ataque.`);
  } else {
    registrar(`Você definiu ${carta.nome} virado pra baixo, em modo de defesa.`);
  }
  render();
}

function irParaBatalha() {
  if (estado.turno !== "jogador" || estado.fase !== "main1") return;
  const semMonstro = estado.campo.jogador.every((z) => z === null);
  if (semMonstro) {
    const confirma = window.confirm(
      "Você ainda não invocou nenhum monstro neste turno. Sem monstro, você não pode atacar nesta fase. Ir para a Fase de Batalha mesmo assim?"
    );
    if (!confirma) return;
  }
  estado.fase = "batalha";
  registrar("Fase de Batalha. Escolha um monstro em ataque pra atacar, ou avance pra Principal 2.");
  render();
}

function irParaMain2() {
  if (estado.turno !== "jogador" || estado.fase !== "batalha") return;
  estado.fase = "main2";
  registrar(
    estado.invocouEsteTurno
      ? "Fase Principal 2. Você já invocou este turno — só falta encerrar."
      : "Fase Principal 2. Ainda dá pra invocar um monstro aqui, se não fez isso na Principal 1."
  );
  render();
}

function selecionarAtacante(idx) {
  const monstro = estado.campo.jogador[idx];
  if (!monstro || monstro.pos !== "atk" || monstro.atacou) return;
  estado.ataqueSelecionado = idx;
  registrar(`${monstro.nome} pronto pra atacar. Escolha o alvo (ou ataque direto se o campo do oponente estiver vazio).`);
  render();
}

function atacar(idxAlvo) {
  if (estado.ataqueSelecionado === null) return;
  const atacante = estado.campo.jogador[estado.ataqueSelecionado];
  const campoIA = estado.campo.ia;
  const temAlvos = campoIA.some((z) => z !== null);

  if (idxAlvo === null) {
    if (temAlvos) {
      registrar("Você precisa atacar um monstro — o campo do oponente não está vazio.");
      render();
      return;
    }
    // ataque direto
    estado.lp.ia -= atacante.atk;
    registrar(`Ataque direto! ${atacante.nome} causou ${atacante.atk} de dano. LP do oponente: ${Math.max(estado.lp.ia,0)}.`);
    atacante.atacou = true;
    estado.ataqueSelecionado = null;
    checarFimDeJogo();
    render();
    return;
  }

  const defensor = campoIA[idxAlvo];
  if (!defensor) return;

  resolverCombate("jogador", estado.ataqueSelecionado, "ia", idxAlvo);
  atacante.atacou = true;
  estado.ataqueSelecionado = null;
  checarFimDeJogo();
  render();
}

function resolverCombate(ladoAtk, idxAtk, ladoDef, idxDef) {
  const atacante = estado.campo[ladoAtk][idxAtk];
  const defensor = estado.campo[ladoDef][idxDef];
  const nomeDefVisivel = defensor.faceDown ? "um monstro virado pra baixo" : defensor.nome;

  if (defensor.faceDown) {
    defensor.faceDown = false;
    registrar(`${defensor.nome} foi revelado: ${defensor.atk} ATK / ${defensor.def} DEF.`);
  }

  if (defensor.pos === "def") {
    if (atacante.atk > defensor.def) {
      registrar(`${atacante.nome} (${atacante.atk} ATK) venceu ${defensor.nome} (${defensor.def} DEF). Monstro destruído. Sem dano de LP — monstro em defesa não causa dano ao ser vencido.`);
      estado.cemiterio[ladoDef].push(defensor);
      estado.campo[ladoDef][idxDef] = null;
    } else if (atacante.atk < defensor.def) {
      const dano = defensor.def - atacante.atk;
      estado.lp[ladoAtk] -= dano;
      registrar(`${atacante.nome} (${atacante.atk} ATK) não passou de ${defensor.nome} (${defensor.def} DEF). Quem atacou perde ${dano} de LP pela diferença.`);
    } else {
      registrar(`Empate exato: ${atacante.atk} ATK contra ${defensor.def} DEF. Nada acontece.`);
    }
  } else {
    // defensor em ataque
    if (atacante.atk > defensor.atk) {
      const dano = atacante.atk - defensor.atk;
      estado.lp[ladoDef] -= dano;
      registrar(`${atacante.nome} (${atacante.atk}) venceu ${defensor.nome} (${defensor.atk}). Monstro destruído e o dono perde ${dano} de LP.`);
      estado.cemiterio[ladoDef].push(defensor);
      estado.campo[ladoDef][idxDef] = null;
    } else if (atacante.atk < defensor.atk) {
      const dano = defensor.atk - atacante.atk;
      estado.lp[ladoAtk] -= dano;
      registrar(`${atacante.nome} (${atacante.atk}) perdeu para ${defensor.nome} (${defensor.atk}). Seu monstro é destruído e você perde ${dano} de LP.`);
      estado.cemiterio[ladoAtk].push(atacante);
      estado.campo[ladoAtk][idxAtk] = null;
    } else {
      registrar(`Empate: ${atacante.nome} e ${defensor.nome} têm o mesmo ATK. Os dois são destruídos, sem dano de LP.`);
      estado.cemiterio[ladoDef].push(defensor);
      estado.cemiterio[ladoAtk].push(atacante);
      estado.campo[ladoDef][idxDef] = null;
      estado.campo[ladoAtk][idxAtk] = null;
    }
  }
}

function encerrarTurno() {
  if (estado.turno !== "jogador" || estado.fimDeJogo) return;
  estado.ataqueSelecionado = null;
  registrar("Você encerrou o turno.");
  passarTurno("ia");
}

function passarTurno(proximo) {
  estado.turno = proximo;
  estado.fase = "main1";
  estado.invocouEsteTurno = false;
  Object.values(estado.campo[proximo]).forEach((z) => { if (z) z.atacou = false; });
  comprar(proximo);
  if (estado.fimDeJogo) { render(); return; }
  registrar(proximo === "ia" ? "Turno do oponente." : "Você comprou uma carta. Sua Fase Principal 1.");
  render();
  if (proximo === "ia") setTimeout(turnoIA, 700);
}

// ---------- IA simples ----------

function turnoIA() {
  if (estado.fimDeJogo) return;

  // Main1: invoca o monstro de maior ATK que couber, sempre em ataque (IA agressiva)
  const zonaLivre = estado.campo.ia.findIndex((z) => z === null);
  if (zonaLivre !== -1 && estado.mao.ia.length > 0) {
    let melhorIdx = 0;
    estado.mao.ia.forEach((c, i) => { if (c.atk > estado.mao.ia[melhorIdx].atk) melhorIdx = i; });
    const carta = estado.mao.ia.splice(melhorIdx, 1)[0];
    estado.campo.ia[zonaLivre] = { ...carta, pos: "atk", faceDown: false, atacou: false };
    registrar(`Oponente invocou ${carta.nome} (${carta.atk} ATK) em modo de ataque.`);
  }

  render();

  // Batalha: ataca com tudo que puder, escolhendo o alvo mais fraco
  setTimeout(() => {
    estado.campo.ia.forEach((atacante, idx) => {
      if (!atacante || atacante.atacou || atacante.pos !== "atk") return;

      const alvos = estado.campo.jogador
        .map((z, i) => ({ z, i }))
        .filter((x) => x.z !== null);

      if (alvos.length === 0) {
        estado.lp.jogador -= atacante.atk;
        registrar(`Oponente atacou direto com ${atacante.nome}! Você perdeu ${atacante.atk} de LP.`);
        atacante.atacou = true;
        checarFimDeJogo();
        return;
      }

      alvos.sort((a, b) => {
        const va = a.z.pos === "def" ? a.z.def : a.z.atk;
        const vb = b.z.pos === "def" ? b.z.def : b.z.atk;
        return va - vb;
      });
      const alvo = alvos[0];
      resolverCombate("ia", idx, "jogador", alvo.i);
      atacante.atacou = true;
      checarFimDeJogo();
    });

    render();
    setTimeout(() => {
      if (!estado.fimDeJogo) {
        registrar("Oponente encerrou o turno.");
        passarTurno("jogador");
      }
    }, 600);
  }, 700);
}

function checarFimDeJogo() {
  if (estado.lp.jogador <= 0) encerrarJogo("ia", "seus LP chegaram a zero");
  else if (estado.lp.ia <= 0) encerrarJogo("jogador", "os LP do oponente chegaram a zero");
}

function encerrarJogo(vencedor, motivo) {
  estado.fimDeJogo = vencedor;
  registrar(vencedor === "jogador" ? `Você venceu! (${motivo})` : `Você perdeu. (${motivo})`);
}

// ---------- render ----------

const ATRIBUTO = {
  light:  { simbolo: "☀", nome: "Luz",   cor: "#e8d488" },
  dark:   { simbolo: "☾", nome: "Trevas", cor: "#9b7fd4" },
  earth:  { simbolo: "⛰", nome: "Terra", cor: "#8fbf6a" },
  fire:   { simbolo: "🔥", nome: "Fogo",  cor: "#e07a4f" },
  water:  { simbolo: "💧", nome: "Água",  cor: "#5aa8d6" },
  wind:   { simbolo: "🌪", nome: "Vento", cor: "#6fd0c4" },
};

function cartaHTML(zona, { clicavel } = {}) {
  if (!zona) return `<div class="zona vazia"></div>`;
  if (zona.faceDown) {
    return `<div class="zona ocupada face-down ${clicavel ? "clicavel" : ""}" ${clicavel ? `data-click="1"` : ""}>
      <div class="carta-campo"><div class="verso">🂠</div><div class="pos-tag">defesa</div></div>
    </div>`;
  }
  const at = ATRIBUTO[zona.atributo] || ATRIBUTO.earth;
  return `<div class="zona ocupada ${clicavel ? "clicavel" : ""}" ${clicavel ? `data-click="1"` : ""} style="--cor-at:${at.cor}">
    <div class="carta-campo">
      <div class="topo-carta">
        <span class="at-icone" title="${at.nome}">${at.simbolo}</span>
        <span class="nivel">Nv.${zona.nivel}</span>
      </div>
      <div class="nome">${zona.nome}</div>
      <div class="tipo-monstro">${zona.tipo}</div>
      <div class="stats">${zona.atk} / ${zona.def}</div>
      <div class="pos-tag">${zona.pos === "atk" ? "ataque" : "defesa"}${zona.atacou ? " · já atacou" : ""}</div>
    </div>
  </div>`;
}

function render() {
  if (!estado) return;

  document.getElementById("lp-ia").textContent = Math.max(estado.lp.ia, 0);
  document.getElementById("lp-jogador").textContent = Math.max(estado.lp.jogador, 0);
  document.getElementById("lp-barra-ia").style.width = `${Math.max(estado.lp.ia, 0) / 80}%`;
  document.getElementById("lp-barra-jogador").style.width = `${Math.max(estado.lp.jogador, 0) / 80}%`;
  document.getElementById("deck-ia").textContent = estado.deck.ia.length;
  document.getElementById("deck-jogador").textContent = estado.deck.jogador.length;
  document.getElementById("cemiterio-ia").textContent = estado.cemiterio.ia.length;
  document.getElementById("cemiterio-jogador").textContent = estado.cemiterio.jogador.length;

  const campoIA = document.getElementById("campo-ia");
  campoIA.innerHTML = estado.campo.ia
    .map((z, i) => {
      const podeAtacar = estado.ataqueSelecionado !== null && estado.turno === "jogador" && estado.fase === "batalha" && z !== null;
      return cartaHTML(z, { clicavel: podeAtacar, onClick: () => atacar(i) })
        .replace('data-click="1"', `data-click="1" data-idx="${i}" data-tipo="alvo"`);
    })
    .join("");

  const campoJogador = document.getElementById("campo-jogador");
  campoJogador.innerHTML = estado.campo.jogador
    .map((z, i) => {
      const podeSelecionar = estado.turno === "jogador" && estado.fase === "batalha" && z && z.pos === "atk" && !z.atacou;
      return cartaHTML(z, { clicavel: podeSelecionar })
        .replace('data-click="1"', `data-click="1" data-idx="${i}" data-tipo="atacante"`);
    })
    .join("");

  const suaVez = estado.turno === "jogador";
  const podeInvocar = suaVez && (estado.fase === "main1" || estado.fase === "main2") && !estado.invocouEsteTurno;

  let motivoTravado = "";
  if (!suaVez) motivoTravado = "É o turno do oponente.";
  else if (estado.fase === "batalha") motivoTravado = "Invocação não disponível durante a Batalha — avance pra Principal 2.";
  else if (estado.invocouEsteTurno) motivoTravado = "Você já invocou 1 monstro este turno (limite por turno).";

  const mao = document.getElementById("mao-jogador");
  mao.innerHTML = estado.mao.jogador
    .map((c, i) => {
      const at = ATRIBUTO[c.atributo] || ATRIBUTO.earth;
      return `
    <div class="carta-mao">
      <div class="carta-mini" style="--cor-at:${at.cor}">
        <div class="img"><span class="at-icone">${at.simbolo}</span><span class="nivel">Nv.${c.nivel}</span></div>
        <div class="corpo">
          <div class="nome">${c.nome}</div>
          <div class="tipo-monstro">${c.tipo}</div>
          <div class="stats">${c.atk} / ${c.def}</div>
        </div>
      </div>
      <div class="acoes-mao">
        <button ${podeInvocar ? "" : "disabled"} title="${podeInvocar ? "" : motivoTravado}" data-acao="atk" data-i="${i}">Invocar (Ataque)</button>
        <button ${podeInvocar ? "" : "disabled"} title="${podeInvocar ? "" : motivoTravado}" data-acao="def" data-i="${i}">Definir (Defesa)</button>
      </div>
    </div>`;
    })
    .join("");
  document.getElementById("motivo-mao").textContent = podeInvocar ? "" : motivoTravado;

  // ---- stepper de fase ----
  const passos = [
    { id: "main1", label: "Principal 1" },
    { id: "batalha", label: "Batalha" },
    { id: "main2", label: "Principal 2" },
  ];
  document.getElementById("stepper").innerHTML = passos
    .map((p) => {
      const ativo = suaVez && estado.fase === p.id;
      const passado = suaVez && passos.findIndex((x) => x.id === estado.fase) > passos.findIndex((x) => x.id === p.id);
      return `<span class="passo ${ativo ? "ativo" : ""} ${passado ? "feito" : ""}">${p.label}</span>`;
    })
    .join('<span class="seta">→</span>');

  document.getElementById("fase-atual").textContent = suaVez
    ? { main1: "Sua vez — Fase Principal 1: invoque um monstro.", batalha: "Sua vez — Fase de Batalha: ataque ou avance.", main2: "Sua vez — Fase Principal 2: última chance de invocar." }[estado.fase]
    : "Turno do oponente — aguarde.";

  const btnBatalha = document.getElementById("btn-batalha");
  const btnMain2 = document.getElementById("btn-main2");
  btnBatalha.style.display = estado.fase === "main1" ? "inline-block" : "none";
  btnMain2.style.display = estado.fase === "batalha" ? "inline-block" : "none";
  btnBatalha.disabled = !(suaVez && estado.fase === "main1");
  btnMain2.disabled = !(suaVez && estado.fase === "batalha");
  document.getElementById("btn-encerrar").disabled = !suaVez;

  const podeAtacarDireto =
    estado.ataqueSelecionado !== null && estado.campo.ia.every((z) => z === null);
  const btnDireto = document.getElementById("btn-ataque-direto");
  btnDireto.disabled = !podeAtacarDireto;
  btnDireto.title =
    estado.ataqueSelecionado === null
      ? "Selecione primeiro um monstro seu em ataque."
      : podeAtacarDireto
      ? ""
      : "Só é possível atacar direto se o campo do oponente estiver vazio.";

  document.getElementById("aviso-alvo").style.display =
    estado.ataqueSelecionado !== null ? "block" : "none";

  const log = document.getElementById("log");
  log.innerHTML = estado.log.map((l) => `<div class="log-linha">${l}</div>`).join("");

  const overlay = document.getElementById("overlay-fim");
  if (estado.fimDeJogo) {
    overlay.style.display = "flex";
    document.getElementById("overlay-msg").textContent =
      estado.fimDeJogo === "jogador" ? "Você venceu o duelo!" : "Você perdeu este duelo.";
  } else {
    overlay.style.display = "none";
  }
}

// ---------- listeners ----------

document.addEventListener("DOMContentLoaded", () => {
  iniciarJogo();

  document.getElementById("campo-ia").addEventListener("click", (e) => {
    const zona = e.target.closest('[data-tipo="alvo"]');
    if (zona) atacar(Number(zona.dataset.idx));
  });

  document.getElementById("campo-jogador").addEventListener("click", (e) => {
    const zona = e.target.closest('[data-tipo="atacante"]');
    if (zona) selecionarAtacante(Number(zona.dataset.idx));
  });

  document.getElementById("mao-jogador").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-acao]");
    if (!btn) return;
    invocar(Number(btn.dataset.i), btn.dataset.acao);
  });

  document.getElementById("btn-ataque-direto").addEventListener("click", () => {
    if (estado.ataqueSelecionado !== null) atacar(null);
  });

  document.getElementById("btn-batalha").addEventListener("click", irParaBatalha);
  document.getElementById("btn-main2").addEventListener("click", irParaMain2);
  document.getElementById("btn-encerrar").addEventListener("click", encerrarTurno);
  document.getElementById("btn-reiniciar").addEventListener("click", iniciarJogo);
});
