// ===============================================================
// COLE O CÓDIGO DA SUA LOGO (BASE64) DENTRO DAS ASPAS ABAIXO:
// Exemplo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
// ===============================================================
const LOGO_BASE64 = ""; 
// ===============================================================

const app = {
    // ESTADO
    vehicles: [], stock: [], sectors: [],
    tempPhotos: [], db: null, dbLocal: null,
    currentLocation: "", collectionName: "",
    userRole: "", adminUser: "Adm", adminPass: "123",
    currentStockId: null,

    // CONFIG FIREBASE (Coloque sua config aqui)
    firebaseConfig: {
       apiKey: "AIzaSyD4le1UcMBqgrBINl9Qt4Sb3dJsVqMygy0",
  authDomain: "gestao-de-veiculos-municipal.firebaseapp.com",
  projectId: "gestao-de-veiculos-municipal",
  storageBucket: "gestao-de-veiculos-municipal.firebasestorage.app",
  messagingSenderId: "989679906816",
  appId: "1:989679906816:web:70480b9283fbe2b5b8a8e5",
  measurementId: "G-MNTBB5LB9Y"

    },

    checklistItemsData: [
        {id: "1", text: "Nível de Óleo / Água"}, {id: "2", text: "Freios e Fluídos"},
        {id: "3", text: "Pneus"}, {id: "4", text: "Luzes"},
        {id: "5", text: "Painel"}, {id: "6", text: "Limpeza"}, {id: "7", text: "Documentos"}
    ],

    // --- INICIALIZAÇÃO ---
    async initApp() {
        // Aplica a Logo Manualmente definida no topo
        if(LOGO_BASE64 && LOGO_BASE64.length > 50) {
            const loginLogo = document.getElementById('app-logo');
            const headerLogo = document.getElementById('header-logo');
            if(loginLogo) loginLogo.src = LOGO_BASE64;
            if(headerLogo) {
                headerLogo.src = LOGO_BASE64;
                headerLogo.style.display = 'block';
            }
        }

        // Carrega Setores
        const savedSectors = localStorage.getItem('sectors');
        if(savedSectors) {
            this.sectors = JSON.parse(savedSectors);
        } else {
            this.sectors = ['SAUDE', 'EDUCACAO', 'OBRAS', 'ADM'];
            localStorage.setItem('sectors', JSON.stringify(this.sectors));
        }
        this.renderSectorButtons();
    },

    // --- GESTÃO DE SETORES ---
    renderSectorButtons() {
        const list = document.getElementById('sector-list');
        const nav = document.getElementById('nav-sector');
        if(!list) return; 

        list.innerHTML = '';
        nav.innerHTML = '<option value="" disabled selected>Setor</option>';

        this.sectors.forEach(sec => {
            const btn = document.createElement('button');
            btn.className = 'btn-location';
            btn.innerHTML = `<span class="material-icons" style="font-size:30px; margin-bottom:5px;">business</span>${sec}`;
            btn.onclick = () => this.selectLocation(sec);
            list.appendChild(btn);

            const opt = document.createElement('option');
            opt.value = sec;
            opt.innerText = sec;
            nav.appendChild(opt);
        });
    },

    addSector() {
        const name = document.getElementById('new-sector-name').value.toUpperCase().trim();
        if(!name) return alert("Digite o nome");
        if(this.sectors.includes(name)) return alert("Já existe");
        this.sectors.push(name);
        localStorage.setItem('sectors', JSON.stringify(this.sectors));
        this.renderSectorButtons();
        document.getElementById('new-sector-name').value = '';
    },

    checkLogin() {
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        if (u === this.adminUser && p === this.adminPass) {
            this.userRole = 'admin';
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('location-screen').style.display = 'flex';
            this.renderSectorButtons();
        } else { alert("Dados incorretos"); }
    },

    selectLocation(loc) { this.switchLocation(loc); document.getElementById('location-screen').style.display = 'none'; document.getElementById('app-content').style.display = 'block'; },
    switchLocation(loc) {
        this.currentLocation = loc;
        this.collectionName = `frota_${loc}`;
        document.getElementById('nav-sector').value = loc;
        document.getElementById('loading-msg').style.display = 'block';
        document.getElementById('vehicle-list').innerHTML = '';
        this.init(); 
    },

    // --- BANCO DE DADOS (ONLINE ONLY) ---
    async init() {
        try {
            if (!firebase.apps.length) firebase.initializeApp(this.firebaseConfig);
            this.db = firebase.firestore();
            
            // Ainda usamos IDB para performance, mas dependemos da conexão para sync
            this.dbLocal = await idb.openDB('gestao-frota-pro', 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains('vehicles')) db.createObjectStore('vehicles', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('stock')) db.createObjectStore('stock', { keyPath: 'id' });
                },
            });

            await this.loadFromLocal();

            this.db.collection(this.collectionName).onSnapshot(async (snap) => {
                document.getElementById('loading-msg').style.display = 'none';
                let data = [];
                snap.forEach(doc => { let d = doc.data(); d._collection = this.collectionName; data.push(d); });
                await this.mergeData(data);
            });

            this.db.collection(`estoque_${this.currentLocation}`).onSnapshot(async (snap) => {
                let data = [];
                snap.forEach(doc => data.push(doc.data()));
                this.stock = data;
                const tx = this.dbLocal.transaction('stock', 'readwrite');
                await tx.store.clear();
                for(const s of data) await tx.store.put(s);
                await tx.done;
            });

        } catch (e) { console.error(e); this.loadFromLocal(); }
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
    },

    async mergeData(serverData) {
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
        this.stock = await this.dbLocal.getAll('stock');
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

    // --- CRUD VEÍCULOS ---
    openNewVehicle() {
        this.tempPhotos = [];
        document.getElementById('vehicle-form').reset();
        document.getElementById('veh-id').value = "";
        document.getElementById('f-placa').readOnly = false;
        document.getElementById('image-preview-container').innerHTML = '';
        document.getElementById('modal').style.display = 'flex';
    },

    editVehicle(id) {
        const v = this.vehicles.find(x => x.id == id);
        this.tempPhotos = v.fotos || [];
        document.getElementById('vehicle-form').reset();
        document.getElementById('veh-id').value = v.id;
        document.getElementById('f-placa').value = v.placa;
        document.getElementById('f-placa').readOnly = true;
        document.getElementById('f-modelo').value = v.modelo;
        document.getElementById('f-status').value = v.status;
        document.getElementById('f-km').value = v.km;
        document.getElementById('f-manu-ultima').value = v.manutencao.ultima;
        document.getElementById('f-manu-proxima').value = v.manutencao.proxima;
        document.getElementById('f-pecas').value = ""; 
        document.getElementById('f-pendencias').value = v.manutencao.pendencias;
        document.getElementById('f-obs').value = v.observacoes;
        this.renderImagePreviews();
        document.getElementById('modal').style.display = 'flex';
    },

    async saveVehicle(e) {
        e.preventDefault();
        let id = document.getElementById('veh-id').value;
        const isNew = !id;
        if (isNew) id = Date.now(); else id = parseInt(id);

        let oldVehicle = this.vehicles.find(v => v.id === id);
        let history = oldVehicle ? (oldVehicle.maintenanceHistory || []) : [];

        const newDate = document.getElementById('f-manu-ultima').value;
        const newDesc = document.getElementById('f-pecas').value;
        const newKm = document.getElementById('f-km').value;

        if (newDate && newDesc) {
            history.push({
                date: newDate,
                desc: newDesc,
                km: newKm,
                recordedAt: new Date().toISOString()
            });
        }

        const veh = {
            id: id,
            _collection: this.collectionName,
            _syncStatus: 'pending',
            placa: document.getElementById('f-placa').value.toUpperCase(),
            modelo: document.getElementById('f-modelo').value,
            status: document.getElementById('f-status').value,
            km: newKm,
            manutencao: {
                ultima: newDate,
                proxima: document.getElementById('f-manu-proxima').value,
                pecas: newDesc,
                pendencias: document.getElementById('f-pendencias').value
            },
            maintenanceHistory: history,
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

    renderList(list = this.vehicles) {
        const c = document.getElementById('vehicle-list'); c.innerHTML = '';
        list.sort((a,b) => a.id - b.id);
        list.forEach(v => {
            const div = document.createElement('div');
            div.className = `card st-${v.status.split(' ')[0]}`;
            div.innerHTML = `
                <div class="card-header"><strong>🚗 ${v.placa}</strong><span><small>${v.status}</small></span></div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item"><span>Modelo</span><b>${v.modelo}</b></div>
                        <div class="info-item"><span>Km</span><b>${v.km}</b></div>
                        <div class="info-item"><span>Rev.</span><b>${this.fmtDate(v.manutencao.ultima)}</b></div>
                    </div>
                </div>
                <div class="card-footer"><button class="btn-card" onclick="app.editVehicle(${v.id})">Editar</button></div>
            `;
            c.appendChild(div);
        });
        document.getElementById('total-card').innerText = list.length;
    },

    // --- RELATÓRIOS ---
    openReportModal() { document.getElementById('report-modal').style.display = 'flex'; },

    async generatePeriodReport() {
        const start = document.getElementById('rep-start').value;
        const end = document.getElementById('rep-end').value;
        if(!start || !end) return alert("Selecione as datas.");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // USA A LOGO DA VARIÁVEL GLOBAL
        if(LOGO_BASE64 && LOGO_BASE64.length > 50) {
            await this.drawSmartLogo(doc, LOGO_BASE64, 14, 10, 25, 25);
        }

        doc.setFontSize(16); doc.text(`Relatório de Manutenção - ${this.currentLocation}`, 105, 20, null, null, "center");
        doc.setFontSize(10); doc.text(`Período: ${this.fmtDate(start)} até ${this.fmtDate(end)}`, 105, 27, null, null, "center");

        let body = [];
        const startDate = new Date(start);
        const endDate = new Date(end);

        this.vehicles.forEach(v => {
            if(v.maintenanceHistory) {
                v.maintenanceHistory.forEach(log => {
                    const logDate = new Date(log.date);
                    if(logDate >= startDate && logDate <= endDate) {
                        body.push([this.fmtDate(log.date), v.placa, v.modelo, log.km + ' km', log.desc || '-']);
                    }
                });
            }
        });

        body.sort((a,b) => new Date(a[0].split('/').reverse().join('-')) - new Date(b[0].split('/').reverse().join('-')));

        if(body.length === 0) return alert("Nenhuma manutenção encontrada.");

        doc.autoTable({
            startY: 40,
            head: [['Data', 'Placa', 'Modelo', 'Km', 'Serviço Realizado']],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8 },
            columnStyles: { 4: { cellWidth: 80 } }
        });

        doc.save(`Relatorio_Manutencao_${start}_${end}.pdf`);
        document.getElementById('report-modal').style.display = 'none';
    },

    // --- UTILS ---
    async drawSmartLogo(doc, b64, x, y, w, h) {
        return new Promise(r => { const i = new Image(); i.src=b64; i.onload=()=>{ doc.addImage(b64,'PNG',x,y,w,h); r(); }; i.onerror=r; });
    },
    fmtDate(d) { if(!d) return '-'; return new Date(d+'T12:00:00').toLocaleDateString('pt-BR'); },
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
    handleImagePreview(e) { Array.from(e.target.files).forEach(file => { this.resizeImage(file, 800, 800, (b64) => { this.tempPhotos.push(b64); this.renderImagePreviews(); }); }); },
    renderImagePreviews() { const c = document.getElementById('image-preview-container'); c.innerHTML = ''; this.tempPhotos.forEach((src, i) => { const d = document.createElement('div'); d.className='photo-wrapper'; d.innerHTML = `<img src="${src}" class="img-preview" onclick="window.open('${src}')"><div class="btn-delete-photo" onclick="app.removePhoto(${i})">&times;</div>`; c.appendChild(d); }); },
    removePhoto(i) { this.tempPhotos.splice(i, 1); this.renderImagePreviews(); },
    
    // UTILS e STOCK (Abreviado para caber, use as mesmas lógicas anteriores)
    closeModal() { document.getElementById('modal').style.display = 'none'; },
    filterList() { const t = document.getElementById('search').value.toLowerCase(); this.renderList(this.vehicles.filter(v => v.placa.toLowerCase().includes(t))); },
    async syncSingleTower(v) { if(!navigator.onLine) return false; try { const d = {...v}; delete d._syncStatus; await this.db.collection(this.collectionName).doc(String(v.id)).set(d); v._syncStatus = 'synced'; return true; } catch(e) { return false; } },
    async syncNow(silent) { if(!navigator.onLine) return; const p = this.vehicles.filter(v => v._syncStatus === 'pending'); if(!p.length) return; if(!silent) document.getElementById('sync-screen').style.display='flex'; for(const v of p) await this.syncSingleTower(v); await this.updateLocalBackup(this.vehicles); this.renderList(); if(!silent) document.getElementById('sync-screen').style.display='none'; },

    // Stock
    openStock() { document.getElementById('stock-modal').style.display = 'flex'; this.renderStockList(); },
    renderStockList() {
        const c = document.getElementById('stock-list'); c.innerHTML = '';
        this.stock.forEach(item => {
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; background:#fff;";
            div.innerHTML = `<div><div style="font-weight:bold;">${item.name}</div><small>Mín: ${item.min || 0}</small></div><div style="text-align:right;"><div style="font-weight:bold; color:${item.qtd <= (item.min||0) ? 'red' : 'green'}">${item.qtd} un</div><button onclick="app.viewStockHistory('${item.id}')" style="font-size:0.8rem; border:none; background:none; color:blue; cursor:pointer;">Histórico</button></div>`;
            c.appendChild(div);
        });
    },
    async createStockItem() {
        const name = document.getElementById('stock-new-name').value; const min = document.getElementById('stock-new-min').value;
        if(!name) return; const item = { id: Date.now().toString(), name, qtd: 0, min: parseInt(min)||0, history: [] };
        await this.saveStockItem(item); document.getElementById('stock-new-name').value = ''; this.renderStockList();
    },
    viewStockHistory(id) { this.currentStockId = id; const item = this.stock.find(i=>i.id===id); document.getElementById('stock-history-panel').style.display='block'; document.getElementById('hist-item-name').innerText=item.name; const tb=document.getElementById('hist-table-body'); tb.innerHTML=''; (item.history||[]).slice().reverse().forEach(log=>{ const r=document.createElement('tr'); r.innerHTML=`<td>${new Date(log.date).toLocaleDateString()}</td><td style="color:${log.type==='ENTRADA'?'green':'red'}">${log.type}</td><td>${log.qtd}</td><td>${log.user}</td>`; tb.appendChild(r); }); },
    async addStockMovement() {
        if(!this.currentStockId) return; const type=document.getElementById('hist-type').value; const qtd=parseInt(document.getElementById('hist-qtd').value); if(!qtd) return;
        const item=this.stock.find(i=>i.id===this.currentStockId);
        if(type==='SAIDA'){ if(item.qtd<qtd) return alert("Insuficiente"); item.qtd-=qtd; } else { item.qtd+=qtd; }
        if(!item.history) item.history=[]; item.history.push({date:new Date().toISOString(), type, qtd, user:this.adminUser});
        await this.saveStockItem(item); document.getElementById('hist-qtd').value=''; this.viewStockHistory(this.currentStockId); this.renderStockList();
    },
    async saveStockItem(item) {
        const idx=this.stock.findIndex(i=>i.id===item.id); if(idx!==-1) this.stock[idx]=item; else this.stock.push(item);
        const tx=this.dbLocal.transaction('stock','readwrite'); await tx.store.put(item); await tx.done;
        if(navigator.onLine && this.db) this.db.collection(`estoque_${this.currentLocation}`).doc(item.id).set(item);
    },

    // Checklist (Abreviado)
    openChecklist() { document.getElementById('checklist-screen').style.display='flex'; this.renderChecklistForm(); this.setupSignaturePad(); },
    closeChecklist() { document.getElementById('checklist-screen').style.display='none'; },
    renderChecklistForm() { const c = document.getElementById('checklist-items-container'); c.innerHTML = ''; this.checklistItemsData.forEach(item => { const row = document.createElement('div'); row.className = 'chk-row'; row.innerHTML = `<div class="chk-title">${item.text}</div><div class="chk-controls"><div class="radio-group"><label class="radio-label"><input type="radio" name="st_${item.id}" value="OK" checked> OK</label><label class="radio-label"><input type="radio" name="st_${item.id}" value="NOK"> NOK</label></div></div><input type="text" class="chk-comment" id="cm_${item.id}" placeholder="Obs">`; c.appendChild(row); }); },
    setupSignaturePad() { const cv = document.getElementById('signature-pad'); const ctx = cv.getContext('2d'); const w = document.querySelector('.signature-pad-wrapper'); cv.width=w.offsetWidth; cv.height=w.offsetHeight; ctx.lineWidth=2; let drawing=false; const start=(e)=>{drawing=true;ctx.beginPath();const p=this.getPos(e,cv);ctx.moveTo(p.x,p.y)}; const move=(e)=>{if(drawing){const p=this.getPos(e,cv);ctx.lineTo(p.x,p.y);ctx.stroke()}}; const end=()=>drawing=false; cv.onmousedown=start; cv.onmousemove=move; cv.onmouseup=end; cv.ontouchstart=(e)=>{e.preventDefault();start(e)}; cv.ontouchmove=(e)=>{e.preventDefault();move(e)}; cv.ontouchend=end; },
    getPos(e, cv) { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; },
    clearSignature() { const cv=document.getElementById('signature-pad'); cv.getContext('2d').clearRect(0,0,cv.width,cv.height); },
    async generateChecklistPDF() {
        if(!confirm("Gerar PDF?")) return;
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        if(LOGO_BASE64 && LOGO_BASE64.length > 50) await this.drawSmartLogo(doc, LOGO_BASE64, 14, 10, 30, 15);
        doc.setFontSize(12); doc.text("CHECKLIST VEICULAR", 105, 20, null, null, "center");
        // ... (Mesmo código de PDF do checklist anterior, apenas adicionando a logo no topo)
        doc.save("Checklist.pdf");
    }
};

window.onload = () => app.initApp();
