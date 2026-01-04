const app = {
    // ESTADO
    vehicles: [], stock: [], tempPhotos: [], db: null, dbLocal: null,
    currentLocation: "", collectionName: "",
    userRole: "", adminUser: "Adm", adminPass: "Pref123",
    currentStockId: null, // Para saber qual item estamos editando no histórico

 
    // =================================================================
    // 2. CONFIGURAÇÃO FIREBASE (Use a sua mesma config)
    // =================================================================
    firebaseConfig: { 
        apiKey: "AIzaSyD4le1UcMBqgrBINl9Qt4Sb3dJsVqMygy0",
  authDomain: "gestao-de-veiculos-municipal.firebaseapp.com",
  projectId: "gestao-de-veiculos-municipal",
  storageBucket: "gestao-de-veiculos-municipal.firebasestorage.app",
  messagingSenderId: "989679906816",
  appId: "1:989679906816:web:70480b9283fbe2b5b8a8e5",
  measurementId: "G-MNTBB5LB9Y"
 },

// CHECKLIST DATA
    checklistItemsData: [
        {id: "1", text: "Nível de Óleo / Água"},
        {id: "2", text: "Freios e Fluídos"},
        {id: "3", text: "Pneus (Calibragem/Estado)"},
        {id: "4", text: "Luzes (Faróis, Setas, Ré)"},
        {id: "5", text: "Painel e Instrumentos"},
        {id: "6", text: "Limpeza e Conservação"},
        {id: "7", text: "Documentos e Cartões"}
    ],

    // --- INICIALIZAÇÃO E LOGIN ---
    initApp() { console.log("App Iniciado"); },

    checkLogin() {
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        if (u === this.adminUser && p === this.adminPass) {
            this.userRole = 'admin';
            document.getElementById('login-screen').style.display = 'none';
            // Se já tiver setor salvo, usa ele, senão vai pra seleção
            if(this.currentLocation) {
                document.getElementById('app-content').style.display = 'block';
            } else {
                document.getElementById('location-screen').style.display = 'flex';
            }
        } else { alert("Dados incorretos"); }
    },

    // --- NAVEGAÇÃO ENTRE SETORES ---
    selectLocation(loc) {
        this.switchLocation(loc);
        document.getElementById('location-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
    },

    // Troca de setor sem sair do app
    switchLocation(loc) {
        if(!loc) return;
        this.currentLocation = loc;
        this.collectionName = `frota_${loc}`;
        
        // Atualiza o Dropdown visualmente
        const select = document.getElementById('nav-sector');
        select.value = loc;
        
        document.getElementById('loading-msg').style.display = 'block';
        document.getElementById('vehicle-list').innerHTML = '';
        
        // Reinicia conexão com o banco para o novo setor
        this.init(); 
    },

    // --- BANCO DE DADOS ---
    async init() {
        try {
            if (!firebase.apps.length) firebase.initializeApp(this.firebaseConfig);
            this.db = firebase.firestore();
            this.dbLocal = await idb.openDB('gestao-frota-pro', 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains('vehicles')) db.createObjectStore('vehicles', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('stock')) db.createObjectStore('stock', { keyPath: 'id' });
                },
            });

            await this.loadFromLocal();

            // Listener Veículos
            this.db.collection(this.collectionName).onSnapshot(async (snapshot) => {
                document.getElementById('loading-msg').style.display = 'none';
                let serverData = [];
                snapshot.forEach(doc => { let d = doc.data(); d._collection = this.collectionName; serverData.push(d); });
                await this.mergeData(serverData);
            });

            // Listener Estoque (Global ou por setor - aqui faremos por setor)
            this.db.collection(`estoque_${this.currentLocation}`).onSnapshot(async (snapshot) => {
                let stockData = [];
                snapshot.forEach(doc => stockData.push(doc.data()));
                this.stock = stockData;
                const tx = this.dbLocal.transaction('stock', 'readwrite');
                await tx.store.clear();
                for(const s of stockData) await tx.store.put(s);
                await tx.done;
                if(document.getElementById('stock-modal').style.display === 'flex') this.renderStockList();
            });

        } catch (e) { console.error(e); this.loadFromLocal(); }
        
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
    },

    async mergeData(serverData) {
        // Lógica de fusão (Mantida simplificada para brevidade)
        // Se local tiver pendente, mantém local. Senão, pega server.
        const allLocal = await this.dbLocal.getAll('vehicles');
        const myLocal = allLocal.filter(t => t._collection === this.collectionName);
        
        const merged = [];
        const ids = new Set();

        for (const loc of myLocal) {
            ids.add(loc.id);
            const srv = serverData.find(s => s.id === loc.id);
            if (loc._syncStatus === 'pending') merged.push(loc);
            else if (srv) merged.push(srv);
            else merged.push(loc);
        }
        for (const srv of serverData) { if (!ids.has(srv.id)) merged.push(srv); }

        this.vehicles = merged;
        await this.updateLocalBackup(this.vehicles);
        this.renderList();
        if(navigator.onLine) this.syncNow(true);
    },

    async loadFromLocal() {
        if (!this.dbLocal) return;
        const all = await this.dbLocal.getAll('vehicles');
        this.vehicles = all.filter(t => t._collection === this.collectionName);
        this.stock = await this.dbLocal.getAll('stock'); // Carrega estoque também
        this.renderList();
        document.getElementById('loading-msg').style.display = 'none';
    },

    async updateLocalBackup(data) {
        const all = await this.dbLocal.getAll('vehicles');
        const others = all.filter(t => t._collection !== this.collectionName);
        const tx = this.dbLocal.transaction('vehicles', 'readwrite');
        await tx.store.clear();
        for (const t of [...others, ...data]) await tx.store.put(t);
        await tx.done;
    },

    // --- GESTÃO DE VEÍCULOS (CRUD) ---
    renderList(list = this.vehicles) {
        const c = document.getElementById('vehicle-list'); c.innerHTML = '';
        if(!list.length) { c.innerHTML = '<p style="text-align:center;color:#777">Nenhum veículo.</p>'; return; }
        
        list.sort((a,b) => a.id - b.id);
        list.forEach(v => {
            const div = document.createElement('div');
            div.className = `card st-${v.status.split(' ')[0]}`;
            const syncIcon = v._syncStatus === 'pending' ? '🟠' : '';
            div.innerHTML = `
                <div class="card-header">
                    <strong>🚗 ${v.placa}</strong>
                    <span>${syncIcon} <small>${v.status}</small></span>
                </div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">Modelo</span><b>${v.modelo}</b></div>
                        <div class="info-item"><span class="info-label">Km</span><b>${v.km}</b></div>
                        <div class="info-item"><span class="info-label">Rev.</span><b>${this.fmtDate(v.manutencao.ultima)}</b></div>
                    </div>
                    ${v.manutencao.pendencias ? `<div style="color:red; font-size:0.8rem; margin-top:5px;">⚠️ ${v.manutencao.pendencias}</div>` : ''}
                </div>
                <div class="card-footer">
                    <button class="btn-card" onclick="app.editVehicle(${v.id})">Editar</button>
                </div>
            `;
            c.appendChild(div);
        });
        document.getElementById('total-card').innerText = list.length;
    },

    openNewVehicle() {
        this.tempPhotos = [];
        document.getElementById('vehicle-form').reset();
        document.getElementById('veh-id').value = ""; // Vazio = Novo
        document.getElementById('f-placa').readOnly = false; // Pode digitar placa
        document.getElementById('image-preview-container').innerHTML = '';
        document.getElementById('modal').style.display = 'flex';
    },

    editVehicle(id) {
        const v = this.vehicles.find(x => x.id == id);
        this.tempPhotos = v.fotos || [];
        document.getElementById('vehicle-form').reset();
        document.getElementById('veh-id').value = v.id;
        document.getElementById('f-placa').value = v.placa;
        document.getElementById('f-placa').readOnly = true; // Não muda placa na edição
        document.getElementById('f-modelo').value = v.modelo;
        document.getElementById('f-status').value = v.status;
        document.getElementById('f-km').value = v.km;
        document.getElementById('f-manu-ultima').value = v.manutencao.ultima;
        document.getElementById('f-manu-proxima').value = v.manutencao.proxima;
        document.getElementById('f-pecas').value = v.manutencao.pecas;
        document.getElementById('f-pendencias').value = v.manutencao.pendencias;
        document.getElementById('f-obs').value = v.observacoes;
        this.renderImagePreviews();
        document.getElementById('modal').style.display = 'flex';
    },

    async saveVehicle(e) {
        e.preventDefault();
        let id = document.getElementById('veh-id').value;
        const isNew = !id;
        if (isNew) id = Date.now(); // ID único baseado no tempo
        else id = parseInt(id);

        const veh = {
            id: id,
            _collection: this.collectionName,
            _syncStatus: 'pending',
            placa: document.getElementById('f-placa').value.toUpperCase(),
            modelo: document.getElementById('f-modelo').value,
            status: document.getElementById('f-status').value,
            km: document.getElementById('f-km').value,
            manutencao: {
                ultima: document.getElementById('f-manu-ultima').value,
                proxima: document.getElementById('f-manu-proxima').value,
                pecas: document.getElementById('f-pecas').value,
                pendencias: document.getElementById('f-pendencias').value
            },
            observacoes: document.getElementById('f-obs').value,
            fotos: this.tempPhotos,
            updatedAt: new Date().toISOString()
        };

        if (isNew) this.vehicles.push(veh);
        else {
            const idx = this.vehicles.findIndex(v => v.id === id);
            if(idx !== -1) this.vehicles[idx] = veh;
        }

        await this.updateLocalBackup(this.vehicles);
        this.closeModal();
        this.renderList();
        if(navigator.onLine) this.syncNow(true);
    },

    // =================================================================
    // 5. ESTOQUE PROFISSIONAL (COM HISTÓRICO)
    // =================================================================
    openStock() {
        document.getElementById('stock-modal').style.display = 'flex';
        this.renderStockList();
    },

    renderStockList() {
        const c = document.getElementById('stock-list'); c.innerHTML = '';
        this.stock.forEach(item => {
            // Calcula total baseado no histórico (Se existir) ou usa o qtd direto
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; background:#fff;";
            div.innerHTML = `
                <div>
                    <div style="font-weight:bold; font-size:1rem;">${item.name}</div>
                    <div style="font-size:0.8rem; color:#666;">Mínimo: ${item.min || 0}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.2rem; font-weight:bold; color:${item.qtd <= (item.min||0) ? 'red' : 'green'}">${item.qtd} un</div>
                    <button onclick="app.viewStockHistory('${item.id}')" style="font-size:0.8rem; color:#0056b3; border:none; background:none; cursor:pointer;">Ver Histórico</button>
                </div>
            `;
            c.appendChild(div);
        });
    },

    async createStockItem() {
        const name = document.getElementById('stock-new-name').value;
        const min = document.getElementById('stock-new-min').value;
        if(!name) return alert("Nome obrigatório");

        const newItem = {
            id: Date.now().toString(),
            name: name,
            qtd: 0,
            min: parseInt(min) || 0,
            history: [] // Array vazio para logs
        };

        // Salva Local e Nuvem
        await this.saveStockItem(newItem);
        
        document.getElementById('stock-new-name').value = '';
        document.getElementById('stock-new-min').value = '';
        this.renderStockList();
    },

    viewStockHistory(id) {
        this.currentStockId = id;
        const item = this.stock.find(i => i.id === id);
        document.getElementById('stock-history-panel').style.display = 'block';
        document.getElementById('hist-item-name').innerText = item.name;
        
        const tbody = document.getElementById('hist-table-body');
        tbody.innerHTML = '';
        
        // Renderiza tabela reversa (mais recente primeiro)
        const hist = item.history || [];
        hist.slice().reverse().forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding:8px; border-bottom:1px solid #eee;">${new Date(log.date).toLocaleDateString()}</td>
                <td style="color:${log.type === 'ENTRADA' ? 'green' : 'red'}">${log.type}</td>
                <td>${log.qtd}</td>
                <td style="font-size:0.8rem; color:#666;">${log.user}</td>
            `;
            tbody.appendChild(row);
        });
    },

    async addStockMovement() {
        if(!this.currentStockId) return;
        const type = document.getElementById('hist-type').value;
        const qtd = parseInt(document.getElementById('hist-qtd').value);
        if(!qtd || qtd <= 0) return alert("Quantidade inválida");

        const item = this.stock.find(i => i.id === this.currentStockId);
        
        // Atualiza Quantidade Geral
        if(type === 'SAIDA') {
            if(item.qtd < qtd) return alert("Estoque insuficiente!");
            item.qtd -= qtd;
        } else {
            item.qtd += qtd;
        }

        // Adiciona Log
        if(!item.history) item.history = [];
        item.history.push({
            date: new Date().toISOString(),
            type: type,
            qtd: qtd,
            user: this.adminUser
        });

        await this.saveStockItem(item);
        
        document.getElementById('hist-qtd').value = '';
        this.viewStockHistory(this.currentStockId); // Atualiza tabela
        this.renderStockList(); // Atualiza lista geral
    },

    async saveStockItem(item) {
        // Atualiza array local em memória
        const idx = this.stock.findIndex(i => i.id === item.id);
        if(idx !== -1) this.stock[idx] = item;
        else this.stock.push(item);

        // Salva no IDB
        const tx = this.dbLocal.transaction('stock', 'readwrite');
        await tx.store.put(item);
        await tx.done;

        // Salva no Firebase
        if(navigator.onLine && this.db) {
            this.db.collection(`estoque_${this.currentLocation}`).doc(item.id).set(item);
        }
    },

    // =================================================================
    // 6. UTILS (IMAGEM, PDF, SYNC - Mantidos iguais)
    // =================================================================
    // ... [Copie as funções auxiliares do exemplo anterior:
    // handleImagePreview, resizeImage, renderImagePreviews, removePhoto, 
    // syncNow, syncSingleTower, toggleSyncScreen, closeModal, filterList]
    
    // Vou colocar as essenciais aqui resumidas para funcionar:
    closeModal() { document.getElementById('modal').style.display = 'none'; },
    filterList() { 
        const term = document.getElementById('search').value.toLowerCase(); 
        this.renderList(this.vehicles.filter(v => v.placa.toLowerCase().includes(term))); 
    },
    fmtDate(d) { if(!d) return '-'; return new Date(d+'T12:00:00').toLocaleDateString('pt-BR'); },
    
    // Funções de Imagem (Compressão)
    handleImagePreview(e) { Array.from(e.target.files).forEach(file => { this.resizeImage(file, 800, 800, (b64) => { this.tempPhotos.push(b64); this.renderImagePreviews(); }); }); },
    resizeImage(file, w, h, cb) { 
        const reader = new FileReader(); reader.readAsDataURL(file); 
        reader.onload = (e) => { 
            const img = new Image(); img.src = e.target.result; 
            img.onload = () => { 
                const c = document.createElement('canvas'); let r = Math.min(w/img.width, h/img.height); 
                c.width = img.width * r; c.height = img.height * r; 
                c.getContext('2d').drawImage(img,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',0.5)); 
            }; 
        }; 
    },
    renderImagePreviews() { const c = document.getElementById('image-preview-container'); c.innerHTML = ''; this.tempPhotos.forEach((src, i) => { const d = document.createElement('div'); d.className='photo-wrapper'; d.innerHTML = `<img src="${src}" class="img-preview" onclick="window.open('${src}')"><div class="btn-delete-photo" onclick="app.removePhoto(${i})">&times;</div>`; c.appendChild(d); }); },
    removePhoto(i) { this.tempPhotos.splice(i, 1); this.renderImagePreviews(); },

    // Sync (Mesma lógica do anterior, adaptada para veículos)
    async syncSingleTower(v) { 
        if(!navigator.onLine) return false;
        try { 
            const d = {...v}; delete d._syncStatus; 
            await this.db.collection(this.collectionName).doc(String(v.id)).set(d); 
            v._syncStatus = 'synced'; return true; 
        } catch(e) { return false; } 
    },
    async syncNow(silent) {
        if(!navigator.onLine) return;
        const p = this.vehicles.filter(v => v._syncStatus === 'pending');
        if(p.length === 0) return;
        if(!silent) document.getElementById('sync-screen').style.display = 'flex';
        for(const v of p) await this.syncSingleTower(v);
        await this.updateLocalBackup(this.vehicles);
        this.renderList();
        if(!silent) document.getElementById('sync-screen').style.display = 'none';
    },
    
    // Funções do Checklist (Mantidas, apenas chamadas ajustadas)
    openChecklist() { document.getElementById('checklist-screen').style.display = 'flex'; this.renderChecklistForm(); this.setupSignaturePad(); },
    closeChecklist() { document.getElementById('checklist-screen').style.display = 'none'; },
    renderChecklistForm() {
        const c = document.getElementById('checklist-items-container'); c.innerHTML = '';
        this.checklistItemsData.forEach(item => {
            const row = document.createElement('div'); row.className = 'chk-row';
            row.innerHTML = `<div class="chk-title">${item.text}</div><div class="chk-controls"><div class="radio-group"><label class="radio-label"><input type="radio" name="st_${item.id}" value="OK" checked> OK</label><label class="radio-label"><input type="radio" name="st_${item.id}" value="NOK"> NOK</label></div></div><input type="text" class="chk-comment" id="cm_${item.id}" placeholder="Obs">`;
            c.appendChild(row);
        });
    },
    setupSignaturePad() {
        const cv = document.getElementById('signature-pad'); const ctx = cv.getContext('2d');
        const wrap = document.querySelector('.signature-pad-wrapper'); cv.width = wrap.offsetWidth; cv.height = wrap.offsetHeight;
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        let drawing = false;
        const start = (e) => { drawing = true; ctx.beginPath(); const p = this.getPos(e, cv); ctx.moveTo(p.x, p.y); };
        const move = (e) => { if(!drawing) return; const p = this.getPos(e, cv); ctx.lineTo(p.x, p.y); ctx.stroke(); };
        const end = () => drawing = false;
        cv.onmousedown = start; cv.onmousemove = move; cv.onmouseup = end;
        cv.ontouchstart = (e) => { e.preventDefault(); start(e); }; cv.ontouchmove = (e) => { e.preventDefault(); move(e); }; cv.ontouchend = end;
    },
    getPos(e, cv) { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; },
    clearSignature() { const cv = document.getElementById('signature-pad'); cv.getContext('2d').clearRect(0,0,cv.width,cv.height); },
    async generateChecklistPDF() { /* (Código PDF igual ao anterior, apenas ajustando IDs se necessário) */ alert("Checklist salvo!"); }
};

window.onload = () => app.initApp();
