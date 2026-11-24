const renderStock = (() => {
  const $ = id => document.getElementById(id);
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(num(value));
  const nowLabel = () => new Date().toLocaleString('pt-BR');
  let editingId = null;

  function lowItems(){ return db.stockItems.filter(item => item.active !== false && num(item.quantity) <= num(item.minimum)); }
  function resetForm(){
    editingId = null;
    $('stockItemForm').reset();
    $('stockItemId').value = '';
    $('stockInitialQty').value = '0';
    $('stockMinimum').value = '0';
    $('stockFormTitle').textContent = 'Cadastrar material';
    $('stockSaveItemBtn').textContent = 'Salvar material';
    $('stockInitialQtyWrap').hidden = false;
    clearMsg($('stockItemMessage'));
  }
  function renderStats(){
    $('stockTotalItems').textContent = db.stockItems.filter(x=>x.active!==false).length;
    $('stockTotalUnits').textContent = fmt(db.stockItems.filter(x=>x.active!==false).reduce((sum,x)=>sum+num(x.quantity),0));
    $('stockLowCount').textContent = lowItems().length;
    $('stockMoveCount').textContent = db.stockMovements.length;
    const badge=$('lowStockBadge');
    badge.hidden = lowItems().length===0;
    badge.textContent = lowItems().length+' baixo'+(lowItems().length===1?'':'s');
  }
  function renderItemOptions(){
    const select=$('stockMoveItem');
    const selected=select.value;
    select.innerHTML='<option value="">Selecione um material...</option>'+db.stockItems.filter(x=>x.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name)+' — '+fmt(x.quantity)+' '+escapeHtml(x.unit)+'</option>').join('');
    if(db.stockItems.some(x=>x.id===selected)) select.value=selected;
  }
  function renderItems(){
    const q=$('stockSearch').value.trim().toLocaleLowerCase('pt-BR');
    const onlyLow=$('stockOnlyLow').checked;
    const list=db.stockItems.filter(item=>{
      if(item.active===false)return false;
      if(onlyLow && num(item.quantity)>num(item.minimum))return false;
      return !q || [item.code,item.name,item.category,item.location].join(' ').toLocaleLowerCase('pt-BR').includes(q);
    }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    $('stockItemsList').innerHTML=list.length?list.map(item=>{
      const low=num(item.quantity)<=num(item.minimum);
      return '<article class="record stock-item '+(low?'stock-low':'')+'"><div class="stock-item-main"><div class="stock-item-title"><strong>'+escapeHtml(item.name)+'</strong>'+(item.code?'<span class="tag">'+escapeHtml(item.code)+'</span>':'')+(low?'<span class="tag pending">Abaixo do mínimo</span>':'<span class="tag done">Disponível</span>')+'</div><div class="muted">'+escapeHtml(item.category||'Sem categoria')+' · Mínimo: '+fmt(item.minimum)+' '+escapeHtml(item.unit)+' · '+escapeHtml(item.location||'Local não informado')+'</div></div><div><div class="stock-item-qty">'+fmt(item.quantity)+' '+escapeHtml(item.unit)+'</div><div class="stock-item-actions"><button type="button" class="secondary sm" data-stock-edit="'+escapeHtml(item.id)+'">Editar</button></div></div></article>';
    }).join(''):'<p class="section-empty">Nenhum material encontrado. Cadastre um material para começar.</p>';
  }
  function renderMovements(){
    const q=$('stockMovementSearch').value.trim().toLocaleLowerCase('pt-BR');
    const list=db.stockMovements.filter(m=>!q||[m.itemName,m.type,m.reason,m.operator].join(' ').toLocaleLowerCase('pt-BR').includes(q)).slice(0,100);
    $('stockMovementsList').innerHTML=list.length?list.map(m=>'<article class="record stock-movement-row"><div><strong>'+escapeHtml(m.itemName)+'</strong><div class="muted">'+escapeHtml(m.date)+' · '+escapeHtml(m.operator)+' · '+escapeHtml(m.reason||'Sem observação')+'</div></div><div class="'+(m.type==='entry'?'stock-in':'stock-out')+'">'+(m.type==='entry'?'+ Entrada':'− Saída')+' '+fmt(m.quantity)+' '+escapeHtml(m.unit)+'</div></article>').join(''):'<p class="section-empty">Nenhuma movimentação registrada.</p>';
  }
  function renderAll(){renderStats();renderItemOptions();renderItems();renderMovements();}
  function saveItem(event){
    event.preventDefault();
    const name=$('stockName').value.trim();
    const code=$('stockCode').value.trim();
    const unit=$('stockUnit').value;
    const minimum=num($('stockMinimum').value);
    const initial=num($('stockInitialQty').value);
    if(!name||!unit||minimum<0||(!editingId&&initial<0)){showMsg($('stockItemMessage'),'Confira os campos obrigatórios e as quantidades.','err');return;}
    const duplicate=db.stockItems.find(x=>x.id!==editingId&&((code&&x.code.toLocaleLowerCase('pt-BR')===code.toLocaleLowerCase('pt-BR'))||x.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')));
    if(duplicate){showMsg($('stockItemMessage'),'Já existe um material com esse nome ou código.','err');return;}
    if(editingId){
      const item=db.stockItems.find(x=>x.id===editingId);
      if(!item)return;
      Object.assign(item,{code,name,category:$('stockCategory').value.trim(),unit,minimum,location:$('stockLocation').value.trim(),updatedAt:nowLabel()});
      addAudit('Edição de material do estoque','Material '+name+' atualizado');
    }else{
      const item={id:'st_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),code,name,category:$('stockCategory').value.trim(),unit,minimum,location:$('stockLocation').value.trim(),quantity:initial,active:true,createdAt:nowLabel()};
      db.stockItems.unshift(item);
      if(initial>0)db.stockMovements.unshift({id:'sm_'+Date.now(),itemId:item.id,itemName:item.name,type:'entry',quantity:initial,unit:item.unit,reason:'Saldo inicial do cadastro',operator:db.activeOperator,date:nowLabel()});
      addAudit('Cadastro de material no estoque','Material '+name+' cadastrado com saldo inicial '+fmt(initial)+' '+unit);
    }
    saveDb();resetForm();renderAll();showMsg($('stockItemMessage'),'Material salvo com sucesso.','ok');
  }
  function editItem(id){
    const item=db.stockItems.find(x=>x.id===id);if(!item)return;
    editingId=id;$('stockItemId').value=id;$('stockCode').value=item.code||'';$('stockName').value=item.name;$('stockCategory').value=item.category||'';$('stockUnit').value=item.unit;$('stockMinimum').value=item.minimum??0;$('stockLocation').value=item.location||'';
    $('stockInitialQtyWrap').hidden=true;$('stockFormTitle').textContent='Editar material';$('stockSaveItemBtn').textContent='Salvar alterações';$('stockName').focus();clearMsg($('stockItemMessage'));
  }
  function registerMovement(){
    const item=db.stockItems.find(x=>x.id===$('stockMoveItem').value);
    const quantity=num($('stockMoveQty').value);
    const type=$('stockMoveType').value;
    if(!item||quantity<=0){showMsg($('stockMoveMessage'),'Selecione um material e informe uma quantidade maior que zero.','err');return;}
    if(type==='exit'&&quantity>num(item.quantity)){showMsg($('stockMoveMessage'),'Saldo insuficiente. Disponível: '+fmt(item.quantity)+' '+item.unit+'.','err');return;}
    item.quantity=num(item.quantity)+(type==='entry'?quantity:-quantity);
    const reason=$('stockMoveReason').value.trim();
    db.stockMovements.unshift({id:'sm_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),itemId:item.id,itemName:item.name,type,quantity,unit:item.unit,reason,operator:db.activeOperator,date:nowLabel()});
    addAudit(type==='entry'?'Entrada no estoque':'Saída do estoque',fmt(quantity)+' '+item.unit+' de '+item.name+(reason?' — '+reason:''));
    saveDb();$('stockMoveQty').value='1';$('stockMoveReason').value='';renderAll();
    showMsg($('stockMoveMessage'),(type==='entry'?'Entrada':'Saída')+' registrada. Saldo atual: '+fmt(item.quantity)+' '+item.unit+'.','ok');
  }
  function exportCsv(){
    const rows=[['Código','Material','Categoria','Quantidade','Unidade','Estoque mínimo','Localização'],...db.stockItems.filter(x=>x.active!==false).map(x=>[x.code,x.name,x.category,x.quantity,x.unit,x.minimum,x.location])];
    const csv=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='estoque_almoxarifado.csv';a.click();URL.revokeObjectURL(url);
  }
  $('stockItemForm').addEventListener('submit',saveItem);
  $('stockCancelEditBtn').addEventListener('click',resetForm);
  $('stockRegisterMoveBtn').addEventListener('click',registerMovement);
  $('stockSearch').addEventListener('input',renderItems);
  $('stockOnlyLow').addEventListener('change',renderItems);
  $('stockMovementSearch').addEventListener('input',renderMovements);
  $('stockExportBtn').addEventListener('click',exportCsv);
  $('stockItemsList').addEventListener('click',event=>{const button=event.target.closest('[data-stock-edit]');if(button)editItem(button.dataset.stockEdit);});
  renderAll();
  return renderAll;
})();
