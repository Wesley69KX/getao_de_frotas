// Cria banco IndexedDB
let db;
const request = indexedDB.open("torresDB", 1);

request.onupgradeneeded = function (event) {
  db = event.target.result;

  db.createObjectStore("towers", { keyPath: "id" });
  db.createObjectStore("pending", { autoIncrement: true });
};

request.onsuccess = function (event) {
  db = event.target.result;
};

// ===========================
// Salvar tabela offline
// ===========================
function saveOffline(key, data) {
  const tx = db.transaction("towers", "readwrite");
  const store = tx.objectStore("towers");
  store.put({ id: key, data: data });
}

// Carregar tabela do offline
function loadOffline(key) {
  return new Promise((resolve) => {
    const tx = db.transaction("towers", "readonly");
    const store = tx.objectStore("towers");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.data || null);
  });
}

// ===========================
// Pendências offline
// ===========================
function savePendingUpdate(obj) {
  const tx = db.transaction("pending", "readwrite");
  tx.objectStore("pending").add(obj);
}

function syncPending() {
  if (!navigator.onLine) return;

  const tx = db.transaction("pending", "readwrite");
  const store = tx.objectStore("pending");

  store.openCursor().onsuccess = async (e) => {
    let cursor = e.target.result;
    if (!cursor) return;

    try {
      await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(cursor.value)
      });

      cursor.delete(); // remove item sincronizado
    } catch (err) {
      console.log("Ainda sem internet...");
    }

    cursor.continue();
  };
}
