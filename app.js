const app = {
    // --- ESTADO DO APP ---
    vehicles: [], stock: [], tempPhotos: [], 
    db: null, dbLocal: null,
    currentLocation: "", collectionName: "",
    
    // --- CONTROLE DE ACESSO ---
    userRole: "", 
    adminUser: "Adm",
    adminPass: "Pref123", // Mudei a senha para contexto de prefeitura
    
    // --- CHECKLIST ---
    signaturePad: null, isDrawing: false,

    // =================================================================
    // 1. LOGOS (Base64)
    // =================================================================
    logoEmpresa: "", // Logo Prefeitura
    logoCliente: "", // Logo Secretaria (Opcional)

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

    // --- ITENS DE MANUTENÇÃO VEICULAR ---
    checklistItemsData: [
        {id: "1", group: "Motor e Fluídos", text: "Nível de Óleo do Motor"},
        {id: "2", group: "Motor e Fluídos", text: "Nível de Água (Radiador)"},
        {id: "3", group: "Motor e Fluídos", text: "Fluído de Freio e Direção"},
        {id: "4", group: "Motor e Fluídos", text: "Vazamentos aparentes"},
        {id: "5", group: "Pneus e Rodas", text: "Calibragem e Estado dos Pneus"},
        {id: "6", group: "Pneus e Rodas", text: "Estepe, Macaco e Chave de Roda"},
        {id: "7", group: "Elétrica", text: "Faróis (Alto/Baixo) e Lanternas"},
        {id: "8", group: "Elétrica", text: "Setas, Luz de Freio e Ré"},
        {id: "9", group: "Elétrica", text: "Limpadores de Para-brisa"},
        {id: "10", group: "Elétrica", text: "Painel de Instrumentos (Luzes de aviso)"},
        {id: "11", group: "Carroceria/Interior", text: "Estado dos Bancos e Cintos"},
        {id: "12", group: "Carroceria/Interior", text: "Retrovisores e Vidros"},
        {id: "13", group: "Carroceria/Interior", text: "Limpeza Geral"},
        {id: "14", group: "Documentação", text: "CRLV e Cartões de Abastecimento"}
    ],

    // =================================================================
    // 3. INICIALIZAÇÃO
    // =================================================================
    initApp() { console.log("Sistema de Frota Iniciado"); },

    checkLogin() {
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        if (u === this.adminUser && p === this.adminPass) {
            this.userRole = 'admin';
            this.showLocationScreen();
        } else { alert("Login Inválido!"); }
    },

    visitorLogin() { this.userRole = 'visitor'; this.showLocationScreen(); },

    showLocationScreen() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('location-screen').style.display = 'flex';
    },

    selectLocation(loc) {
        this.currentLocation = loc;
        this.collectionName = `frota_${loc}`; // Ex: frota_SAUDE
        document.getElementById('location-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('current-loc-badge').innerText = loc;
        this.init(); 
    },

    // =================================================================
    // 4. BANCO DE DADOS (VEÍCULOS + ESTOQUE)
    // =================================================================
    async init() {
        setTimeout(() => {
            const loading = document.getElementById('loading-msg');
            if(loading) loading.style.display = 'none';
        }, 3000);

        try {
            if (!firebase.apps.length) firebase.initializeApp(this.firebaseConfig);
            this.db = firebase.firestore();
            
            // Banco Local com tabela de Veículos E Estoque
            this.dbLocal = await idb.openDB('gestao-frota-db', 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains('vehicles')) db.createObjectStore('vehicles', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('stock')) db.createObjectStore('stock', { keyPath: 'id', autoIncrement: true });
                },
            });

            await this.loadFromLocal();

            // Listener Frota
            this.db.collection(this.collectionName).onSnapshot(async (snapshot) => {
                const loading = document.getElementById('loading-msg');
                if(loading) loading.style.display = 'none';
                
                let serverData = [];
                if (!snapshot.empty) {
                    snapshot.forEach(doc => {
                        let data = doc.data();
                        data._collection = this.collectionName; 
                        serverData.push(data);
                    });
                }
                await this.mergeData(serverData);
            });

            // Listener Estoque (Coleção separada: estoque_SAUDE)
            this.db.collection(`estoque_${this.currentLocation}`).onSnapshot(async (snapshot) => {
                let stockData = [];
                snapshot.forEach(doc => stockData.push(doc.data()));
                this.stock = stockData;
                // Salva estoque localmente também
                const tx = this.dbLocal.transaction('stock', 'readwrite');
                await tx.store.clear();
                for(const s of stockData) await tx.store.put(s);
                await tx.done;
            });

        } catch (e) {
            console.error("Erro init:", e);
            this.loadFromLocal();
        }

        this.setupConnectivityListeners();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
    },

    async mergeData(serverData) {
        const allLocal = await this.dbLocal.getAll('vehicles');
        const myLocalData = allLocal.filter(t => t._collection === this.collectionName);

        if (serverData.length === 0 && myLocalData.length === 0) {
            this.checkDataIntegrity();
            return;
        }

        const merged = [];
        const idsProcessed = new Set();

        for (const localItem of myLocalData) {
            idsProcessed.add(localItem.id);
            const serverItem = serverData.find(s => s.id === localItem.id);

            if (localItem._syncStatus === 'pending') {
                merged.push(localItem); 
            } else if (serverItem) {
                const serverTime = new Date(serverItem.updatedAt || 0).getTime();
                const localTime = new Date(localItem.updatedAt || 0).getTime();
                if (localTime > serverTime + 1000) merged.push(localItem); 
                else merged.push(serverItem); 
            } else {
                merged.push(localItem);
            }
        }

        for (const serverItem of serverData) {
            if (!idsProcessed.has(serverItem.id)) merged.push(serverItem);
        }

        this.vehicles = merged;
        await this.updateLocalBackup(this.vehicles); 
        this.renderList();
        if (navigator.onLine) this.syncNow(true); 
    },

    async loadFromLocal() {
        if (!this.dbLocal) return;
        const allData = await this.dbLocal.getAll('vehicles');
        this.vehicles = allData.filter(t => t._collection === this.collectionName);
        
        // Carrega estoque local
        this.stock = await this.dbLocal.getAll('stock');

        if(this.vehicles.length > 0) this.renderList();
        document.getElementById('loading-msg').style.display = 'none';
    },

    async checkDataIntegrity() {
        const allData = await this.dbLocal.getAll('vehicles');
        const currentLocData = allData.filter(t => t._collection === this.collectionName);
        if (currentLocData.length === 0) await this.seedDatabase(); 
        document.getElementById('loading-msg').style.display = 'none';
    },

    async updateLocalBackup(data) {
        if (!this.dbLocal) return;
        const allData = await this.dbLocal.getAll('vehicles');
        const otherData = allData.filter(t => t._collection !== this.collectionName);
        const newData = [...otherData, ...data];

        const tx = this.dbLocal.transaction('vehicles', 'readwrite');
        await tx.store.clear();
        for (const t of newData) await tx.store.put(t);
        await tx.done;
    },

    // --- SEED (DADOS INICIAIS DA FROTA) ---
    async seedDatabase() {
        const nowStr = new Date().toISOString();
        const batch = this.db ? this.db.batch() : null;
        
        // Veículos padrão por secretaria
        let prefix = "ABC";
        let qtd = 5;
        let tipo = "Gol 1.0";

        if (this.currentLocation === 'SAUDE') { prefix = "SAM"; qtd = 4; tipo = "Ambulância"; }
        if (this.currentLocation === 'OBRAS') { prefix = "TRT"; qtd = 6; tipo = "Caminhão"; }
        if (this.currentLocation === 'EDUCACAO') { prefix = "ESC"; qtd = 8; tipo = "Ônibus"; }

        this.vehicles = [];

        for (let i = 1; i <= qtd; i++) {
            const placa = `${prefix}-${1000 + i}`;
            const veh = {
                id: i,
                _collection: this.collectionName,
                _syncStatus: 'synced', 
                placa: placa,
                modelo: tipo,
                status: "Operando",
                km: 50000 + (i*1000),
                manutencao: { ultima: "", proxima: "", pecas: "", pendencias: "" },
                observacoes: "", fotos: [], updatedAt: nowStr
            };
            this.vehicles.push(veh);

            if(batch && this.userRole === 'admin') {
                const docRef = this.db.collection(this.collectionName).doc(String(i));
                batch.set(docRef, veh);
            }
        }
        
        await this.updateLocalBackup(this.vehicles);
        if(batch && this.userRole === 'admin') {
            try { await batch.commit(); } catch(e) {}
        }
        this.renderList();
    },

    // =================================================================
    // 5. ESTOQUE
    // =================================================================
    openStock() {
        document.getElementById('stock-modal').style.display = 'flex';
        this.renderStockList();
    },

    renderStockList() {
        const container = document.getElementById('stock-list');
        container.innerHTML = '';
        this.stock.forEach(item => {
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;";
            div.innerHTML = `<span><strong>${item.name}</strong></span> 
                             <span style="background:#eee; padding:5px 10px; border-radius:10px;">Qtd: ${item.qtd}</span>
                             <button onclick="app.deleteStock('${item.id}')" style="background:none; border:none; color:red; font-weight:bold;">X</button>`;
            container.appendChild(div);
        });
    },

    async addStockItem() {
        const name = document.getElementById('stock-name').value;
        const qtd = document.getElementById('stock-qtd').value;
        if(!name || !qtd) return alert("Preencha tudo");

        const item = { id: Date.now().toString(), name, qtd: parseInt(qtd) };
        this.stock.push(item);
        
        // Salva Local
        const tx = this.dbLocal.transaction('stock', 'readwrite');
        await tx.store.put(item);
        await tx.done;

        // Salva Nuvem
        if(navigator.onLine && this.db) {
            this.db.collection(`estoque_${this.currentLocation}`).doc(item.id).set(item);
        }

        document.getElementById('stock-name').value = '';
        document.getElementById('stock-qtd').value = '';
        this.renderStockList();
    },

    async deleteStock(id) {
        if(!confirm("Apagar item?")) return;
        this.stock = this.stock.filter(i => i.id !== id);
        
        // Remove Local
        const tx = this.dbLocal.transaction('stock', 'readwrite');
        await tx.store.delete(id);
        await tx.done;

        // Remove Nuvem
        if(navigator.onLine && this.db) {
            this.db.collection(`estoque_${this.currentLocation}`).doc(id).delete();
        }
        this.renderStockList();
    },

    // =================================================================
    // 6. RENDERIZAÇÃO E SALVAMENTO DE VEÍCULOS
    // =================================================================
    renderList(list = this.vehicles) {
        const container = document.getElementById('vehicle-list');
        container.innerHTML = '';
        if(!list || list.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Nenhum veículo encontrado.</div>';
            return;
        }

        list.sort((a, b) => a.id - b.id);

        list.forEach(v => {
            const div = document.createElement('div');
            div.className = `card st-${v.status.replace(' ','')}`;
            
            const syncIcon = v._syncStatus === 'pending' ? `<span style="color:orange; font-size:12px; float:right;">🟠 Pendente</span>` : '';
            const fmtDate = (d) => (d && d.length > 5) ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

            div.innerHTML = `
                <div class="card-header">
                    <strong>🚗 ${v.placa}</strong>
                    <div>${syncIcon} <span class="status-pill">${v.status}</span></div>
                </div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">Modelo</span><span class="info-value">${v.modelo}</span></div>
                        <div class="info-item"><span class="info-label">Km Atual</span><span class="info-value">${v.km} km</span></div>
                        <div class="info-item"><span class="info-label">Última Revisão</span><span class="info-value">${fmtDate(v.manutencao.ultima)}</span></div>
                        <div class="info-item"><span class="info-label">Pendências</span><span class="info-value text-red">${v.manutencao.pendencias || 'Nada'}</span></div>
                    </div>
                    ${v.fotos.length > 0 ? `<div style="margin-top:5px; color:blue;">📷 ${v.fotos.length} fotos</div>` : ''}
                </div>
                <div class="card-footer">
                    <button class="btn-card btn-pdf-single" onclick="app.generatePDF(${v.id})">Histórico</button>
                    ${this.userRole === 'admin' ? `<button class="btn-card btn-edit" onclick="app.editVehicle(${v.id})">Editar</button>` : ''}
                </div>
            `;
            container.appendChild(div);
        });
        document.getElementById('total-card').innerText = list.length;
    },

    async saveVehicle(e) {
        if(this.userRole !== 'admin') return alert("Acesso negado");
        e.preventDefault();
        const id = parseInt(document.getElementById('veh-id').value);
        
        const veh = {
            id: id,
            _collection: this.collectionName,
            _syncStatus: 'pending',
            placa: document.getElementById('f-placa').value,
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

        const index = this.vehicles.findIndex(t => t.id === id);
        if(index !== -1) this.vehicles[index] = veh;
        
        await this.updateLocalBackup(this.vehicles);
        this.closeModal();
        this.renderList();

        if(navigator.onLine) this.syncNow(true);
    },

    // =================================================================
    // 7. UTILS DE IMAGEM E PDF (MANTIDOS DA VERSÃO ANTERIOR)
    // =================================================================
    async drawSmartLogo(doc, base64, x, y, maxW, maxH) {
        if (!base64 || base64.length < 100) return;
        return new Promise((resolve) => {
            const img = new Image(); img.src = base64;
            img.onload = () => {
                const r = img.width / img.height; let w = maxW, h = maxW/r;
                if (h > maxH) { h = maxH; w = maxH * r; }
                try { doc.addImage(base64, 'PNG', x+(maxW-w)/2, y+(maxH-h)/2, w, h); } catch(e){}
                resolve();
            };
            img.onerror = resolve;
        });
    },

    async generateGlobalPDF() {
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        await this.drawSmartLogo(doc, this.logoEmpresa, 14, 10, 30, 15);
        
        doc.setFontSize(16); doc.text(`Relatório de Frota - ${this.currentLocation}`, 105, 20, null, null, "center");
        doc.setFontSize(10); doc.text(`Data: ${new Date().toLocaleDateString()}`, 105, 26, null, null, "center");

        const body = this.vehicles.map(v => [v.placa, v.modelo, v.km + ' km', v.status, v.manutencao.pendencias || '-']);
        
        doc.autoTable({
            startY: 40,
            head: [['Placa', 'Modelo', 'Km', 'Status', 'Pendências']],
            body: body,
            theme: 'grid'
        });
        
        doc.save(`Frota_${this.currentLocation}.pdf`);
    },

    // Sync, Edit Modal, Toggle Screen (Mesmo código robusto de antes)
    editVehicle(id) {
        const v = this.vehicles.find(x => x.id == id);
        this.tempPhotos = v.fotos || [];
        document.getElementById('vehicle-form').reset();
        document.getElementById('image-preview-container').innerHTML = '';
        
        document.getElementById('veh-id').value = v.id;
        document.getElementById('f-placa').value = v.placa;
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

    // ... (Copiar funções de sync, resizeImage, handlePreview, toggleSyncScreen do código anterior, são idênticas)
    // Para economizar espaço na resposta, use as mesmas funções do app.js anterior para:
    // syncNow, syncSingleTower, toggleSyncScreen, handleImagePreview, resizeImage, renderImagePreviews, removePhoto, closeModal, filterList, updateOnlineStatus, openChecklist, closeChecklist, renderChecklistForm, setupSignaturePad, getPos, clearSignature.
    
    // Basta mudar os IDs do checklist para pegar 'chk-placa' e 'chk-km' na hora de gerar o PDF.
    
    // Vou colocar a função de PDF de Checklist adaptada aqui:
    async generateChecklistPDF() {
        if(!confirm("Gerar PDF?")) return;
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        
        await this.drawSmartLogo(doc, this.logoEmpresa, 14, 10, 30, 15);
        doc.setFontSize(12); doc.text("CHECKLIST DE VEÍCULO", 105, 20, null, null, "center");
        
        const placa = document.getElementById('chk-placa').value;
        const km = document.getElementById('chk-km').value;
        const resp = document.getElementById('chk-resp').value;
        
        doc.setFontSize(10);
        doc.text(`Placa: ${placa}   |   Km: ${km}`, 14, 40);
        doc.text(`Responsável: ${resp}`, 14, 46);
        
        const tableBody = [];
        this.checklistItemsData.forEach(item => {
            const status = document.querySelector(`input[name="status_${item.id}"]:checked`)?.value || '-';
            const comment = document.getElementById(`comment_${item.id}`)?.value || '';
            tableBody.push([item.text, status, comment]);
        });
        
        doc.autoTable({
            startY: 55,
            head: [['Item Verificado', 'Situação', 'Obs']],
            body: tableBody,
            columnStyles: { 0: {cellWidth: 100}, 1: {cellWidth: 20} }
        });
        
        // Assinatura
        try { const canvas = document.getElementById('signature-pad'); const img = canvas.toDataURL('image/png'); doc.addImage(img, 'PNG', 70, doc.lastAutoTable.finalY + 10, 50, 25); } catch(e){}
        
        doc.save(`Checklist_${placa}.pdf`);
    },
    
    // Funções auxiliares copiadas do anterior para garantir funcionamento:
    closeModal() { document.getElementById('modal').style.display = 'none'; this.tempPhotos = []; },
    filterList() { const term = document.getElementById('search').value.toLowerCase(); this.renderList(this.vehicles.filter(t => t.placa.toLowerCase().includes(term) || t.modelo.toLowerCase().includes(term))); },
    
    toggleSyncScreen(show, success = false) {
        const screen = document.getElementById('sync-screen');
        if(show) {
            screen.style.display = 'flex';
            document.getElementById('sync-spinner').style.display = success ? 'none' : 'block';
            document.getElementById('sync-icon-ok').style.display = success ? 'block' : 'none';
            document.getElementById('sync-title').innerText = success ? "Concluído!" : "Sincronizando...";
        } else {
            screen.style.display = 'none';
        }
    },

    async syncSingleTower(vehicle) { // Renomeado logicamente para vehicle, mas usa mesma lógica
        if (!navigator.onLine || !this.db) return false;
        try {
            const dataToSend = {...vehicle};
            delete dataToSend._syncStatus; 
            await this.db.collection(this.collectionName).doc(String(vehicle.id)).set(dataToSend);
            vehicle._syncStatus = 'synced';
            return true;
        } catch (error) { return false; }
    },

    async syncNow(silent = false) { 
        if(!navigator.onLine || !this.db || this.userRole !== 'admin') {
            if(!silent) alert("Sem conexão.");
            return;
        }
        const pending = this.vehicles.filter(t => t._syncStatus === 'pending');
        if (pending.length === 0) { if(!silent) alert("Tudo atualizado!"); return; }
        if(!silent) this.toggleSyncScreen(true, false);
        for (const v of pending) {
            const success = await this.syncSingleTower(v);
            if(success) {
                const idx = this.vehicles.findIndex(x => x.id === v.id);
                if(idx !== -1) this.vehicles[idx] = v;
            }
        }
        await this.updateLocalBackup(this.vehicles);
        this.renderList();
        if(!silent) {
            this.toggleSyncScreen(true, true);
            setTimeout(() => this.toggleSyncScreen(false), 1500);
        }
    },
    
    // Funções de Imagem
    handleImagePreview(e) { Array.from(e.target.files).forEach(file => { this.resizeImage(file, 800, 800, (b64) => { this.tempPhotos.push(b64); this.renderImagePreviews(); }); }); },
    resizeImage(file, w, h, cb) { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const c = document.createElement('canvas'); let r = Math.min(w/img.width, h/img.height); c.width=img.width*r; c.height=img.height*r; c.getContext('2d').drawImage(img,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',0.5)); }; }; },
    renderImagePreviews() { const c = document.getElementById('image-preview-container'); c.innerHTML = ''; this.tempPhotos.forEach((src, i) => { const d = document.createElement('div'); d.className='photo-wrapper'; d.innerHTML = `<img src="${src}" class="img-preview" onclick="window.open('${src}')"><div class="btn-delete-photo" onclick="app.removePhoto(${i})">&times;</div>`; c.appendChild(d); }); },
    removePhoto(i) { this.tempPhotos.splice(i, 1); this.renderImagePreviews(); },
    
    // Funções de Checklist UI
    openChecklist() { document.getElementById('checklist-screen').style.display = 'flex'; this.renderChecklistForm(); this.setupSignaturePad(); },
    closeChecklist() { document.getElementById('checklist-screen').style.display = 'none'; },
    renderChecklistForm() {
        const container = document.getElementById('checklist-items-container'); container.innerHTML = '';
        let currentGroup = '';
        this.checklistItemsData.forEach(item => {
            if (item.group !== currentGroup) { currentGroup = item.group; container.innerHTML += `<div class="check-section"><h3>${currentGroup}</h3></div>`; }
            const section = container.lastElementChild;
            const row = document.createElement('div'); row.className = 'chk-row';
            row.innerHTML = `<div class="chk-title">${item.text}</div><div class="chk-controls"><div class="radio-group"><label class="radio-label"><input type="radio" name="status_${item.id}" value="OK" checked> OK</label><label class="radio-label"><input type="radio" name="status_${item.id}" value="NOK"> NOK</label></div></div><input type="text" class="chk-comment" id="comment_${item.id}" placeholder="Obs...">`;
            section.appendChild(row);
        });
    },
    setupSignaturePad() {
        const canvas = document.getElementById('signature-pad'); const ctx = canvas.getContext('2d');
        const wrapper = document.querySelector('.signature-pad-wrapper'); canvas.width = wrapper.offsetWidth; canvas.height = wrapper.offsetHeight;
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
        const startDraw = (e) => { this.isDrawing = true; ctx.beginPath(); const { offsetX, offsetY } = this.getPos(e, canvas); ctx.moveTo(offsetX, offsetY); };
        const draw = (e) => { if (!this.isDrawing) return; const { offsetX, offsetY } = this.getPos(e, canvas); ctx.lineTo(offsetX, offsetY); ctx.stroke(); };
        const stopDraw = () => { this.isDrawing = false; };
        canvas.onmousedown = startDraw; canvas.onmousemove = draw; canvas.onmouseup = stopDraw;
        canvas.ontouchstart = (e) => { e.preventDefault(); startDraw(e); }; canvas.ontouchmove = (e) => { e.preventDefault(); draw(e); }; canvas.ontouchend = stopDraw;
    },
    getPos(e, canvas) { if (e.touches && e.touches.length > 0) { const rect = canvas.getBoundingClientRect(); return { offsetX: e.touches[0].clientX - rect.left, offsetY: e.touches[0].clientY - rect.top }; } return { offsetX: e.offsetX, offsetY: e.offsetY }; },
    clearSignature() { const canvas = document.getElementById('signature-pad'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); },
    updateOnlineStatus() { const el = document.getElementById('connection-status'); el.innerText = navigator.onLine ? "Online" : "Offline"; el.className = navigator.onLine ? "status-badge online" : "status-badge offline"; }
};

window.onload = () => app.initApp();
