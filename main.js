import { db, towersRef } from "./firebase.js";
import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

let editingId = null;

// ===============================
// CARREGAR TORRES
// ===============================
async function loadFirestore() {
  const snap = await getDocs(towersRef);
  const list = [];

  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
  render(list);
}

function render(data) {
  const div = document.getElementById("list");
  div.innerHTML = "";

  data.forEach(t => {
    div.innerHTML += `
      <div class="card">
        <h3>${t.nome}</h3>
        <p>Status: <b>${t.status}</b></p>
        <p>Última comunicação: ${t.com || "-"}</p>

        <button onclick='edit("${t.id}")'>✏️ Editar</button>
      </div>
    `;
  });
}

// ===============================
// NOVA TORRE
// ===============================
function openAdd() {
  editingId = null;

  document.getElementById("modal-title").innerText = "Nova Torre";
  document.getElementById("mTorre").value = "";
  document.getElementById("mStatus").value = "Operando";
  document.getElementById("mCom").value = "";
  document.getElementById("mFalha").value = "";

  openModal();
}

// ===============================
// EDITAR
// ===============================
async function edit(id) {
  editingId = id;

  const ref = doc(db, "torres", id);
  const snap = await getDoc(ref);
  const t = snap.data();

  document.getElementById("modal-title").innerText = "Editar Torre";
  document.getElementById("mTorre").value = t.nome;
  document.getElementById("mStatus").value = t.status;
  document.getElementById("mCom").value = t.com;
  document.getElementById("mFalha").value = t.falha;

  openModal();
}

// ===============================
// SALVAR
// ===============================
async function save() {
  const data = {
    nome: document.getElementById("mTorre").value,
    status: document.getElementById("mStatus").value,
    com: document.getElementById("mCom").value,
    falha: document.getElementById("mFalha").value
  };

  if (editingId) {
    await updateDoc(doc(db, "torres", editingId), data);
  } else {
    await addDoc(towersRef, data);
  }

  closeModal();
  loadFirestore();
}

// ===============================
// MODAL
// ===============================
function openModal() {
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

// Expor funções para o HTML
window.openAdd = openAdd;
window.edit = edit;
window.save = save;

// Iniciar
loadFirestore();
