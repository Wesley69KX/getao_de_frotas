// IndexedDB LOCAL
let db;
const req = indexedDB.open("torresDB", 1);

req.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore("torres", { keyPath: "id", autoIncrement: true });
};

req.onsuccess = e => {
  db = e.target.result;
  loadLocal();
};

// ==============================
// Função para listar localmente
// ==============================
function loadLocal() {
  const tx = db.transaction("torres", "readonly");
  const store = tx.objectStore("torres");
  const req = store.getAll();

  req.onsuccess = () => render(req.result);
}

function render(data) {
  const div = document.getElementById("list");
  div.innerHTML = "";

  data.forEach(t => {
    div.innerHTML += `
      <div class="card">
        <h3>${t.nome}</h3>
        <p>Status: ${t.status}</p>
        <p>Última comunicação: ${t.com}</p>
        <button onclick='edit(${t.id})'>Editar</button>
      </div>
    `;
  });
}

// ===============
// Abrir modal
// ===============
let editingId = null;

function openAdd() {
  editingId = null;
  document.getElementById("mTorre").value = "";
  document.getElementById("mStatus").value = "Operando";
  document.getElementById("mCom").value = "";
  document.getElementById("mFalha").value = "";
  openModal();
}

function edit(id) {
  const tx = db.transaction("torres", "readonly");
  const store = tx.objectStore("torres");
  const req = store.get(id);

  req.onsuccess = () => {
    const t = req.result;

    editingId = id;
    document.getElementById("mTorre").value = t.nome;
    document.getElementById("mStatus").value = t.status;
    document.getElementById("mCom").value = t.com;
    document.getElementById("mFalha").value = t.falha;

    openModal();
  };
}

function save() {
  const data = {
    id: editingId,
    nome: document.getElementById("mTorre").value,
    status: document.getElementById("mStatus").value,
    com: document.getElementById("mCom").value,
    falha: document.getElementById("mFalha").value
  };

  const tx = db.transaction("torres", "readwrite");
  const store = tx.objectStore("torres");

  if (data.id) store.put(data);
  else store.add(data);

  tx.oncomplete = () => {
    closeModal();
    loadLocal();
  };
}

// Modal
function openModal() {
  document.getElementById("modal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

// ==========================
// SINCRONIZAÇÃO COM SERVIDOR
// ==========================
async function syncNow() {
  const tx = db.transaction("torres", "readonly");
  const store = tx.objectStore("torres");
  const req = store.getAll();

  req.onsuccess = async () => {
    const localData = req.result;

    await fetch("/api/towers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localData)
    });

    alert("Sincronizado com sucesso!");
  };
}
