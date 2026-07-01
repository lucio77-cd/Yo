// ===========================================================
// app.js — progresso do aprendizado (localStorage) + componentes
// ===========================================================

const LICOES = ["basico", "campo", "turno", "combate"];
const CHAVE = "ygoh_progresso";

function lerProgresso() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || {};
  } catch {
    return {};
  }
}

function marcarConcluida(id) {
  const p = lerProgresso();
  p[id] = true;
  localStorage.setItem(CHAVE, JSON.stringify(p));
}

// Pinta a trilha na index.html de acordo com o progresso salvo
function pintarTrilha() {
  const progresso = lerProgresso();
  document.querySelectorAll(".trilha-item[data-licao]").forEach((el) => {
    const id = el.dataset.licao;
    if (progresso[id]) {
      el.classList.add("done");
      el.querySelector(".status").textContent = "concluído";
    }
  });
}

// Ativa o clique/toque nas cartas-oráculo (flip card)
function ativarOraculos() {
  document.querySelectorAll(".oraculo").forEach((card) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    const alternar = () => card.classList.toggle("flipped");
    card.addEventListener("click", alternar);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alternar();
      }
    });
  });
}

// Marca a página atual como concluída ao clicar em "próxima lição"
function ativarConclusao() {
  const btn = document.querySelector("[data-concluir]");
  if (btn) {
    btn.addEventListener("click", () => {
      marcarConcluida(btn.dataset.concluir);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  pintarTrilha();
  ativarOraculos();
  ativarConclusao();
});
