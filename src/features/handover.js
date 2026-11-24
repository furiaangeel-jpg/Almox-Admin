const renderHandover = (() => {
  const $ = id => document.getElementById(id);
  const today = () => {
    const d = new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const formatDate = value => {
    if(!value)return 'Data não informada';
    const parts=value.split('-');
    return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:value;
  };
  const statusLabel = status => status==='received'?'Recebida':'Aguardando recebimento';
  const priorityClass = p => p==='Alta'?'priority-high':p==='Atenção'?'priority-attention':'';
  const priorityTag = p => p==='Alta'?'tag exp-err':p==='Atenção'?'tag pending':'tag done';
  const textField = (label,value) => value?'<div class="handover-field"><strong>'+label+'</strong><p>'+escapeHtml(value)+'</p></div>':'';
  function resetForm(){
    $('handoverForm').reset();
    $('handoverDate').value=today();
    $('handoverOutgoing').value=db.activeOperator||'';
    $('handoverPriority').value='Normal';
    $('handoverStatus').value='open';
    clearMsg($('handoverMessage'));
  }
  function renderStats(){
    const records=db.shiftHandovers||[];
    const pending=records.filter(x=>x.status!=='received');
    $('handoverTotal').textContent=records.length;
    $('handoverPending').textContent=pending.length;
    $('handoverReceived').textContent=records.length-pending.length;
    $('handoverUrgent').textContent=pending.filter(x=>x.priority==='Alta').length;
    const badge=$('handoverOpenBadge');
    badge.hidden=pending.length===0;
    badge.textContent=pending.length+' aberta'+(pending.length===1?'':'s');
  }
  function renderRecords(){
    const query=$('handoverSearch').value.trim().toLocaleLowerCase('pt-BR');
    const filter=$('handoverFilter').value;
    const records=(db.shiftHandovers||[]).filter(r=>{
      if(filter&&r.status!==filter)return false;
      return !query||[r.protocol,r.outgoing,r.incoming,r.shift,r.occurrences,r.pendingTasks,r.stock,r.equipment,r.notes].join(' ').toLocaleLowerCase('pt-BR').includes(query);
    }).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    $('handoverRecords').innerHTML=records.length?records.map(r=>{
      const details=[
        textField('Ocorrências do plantão',r.occurrences),
        textField('Pendências para o próximo plantão',r.pendingTasks),
        textField('Materiais / estoque',r.stock),
        textField('Equipamentos / empréstimos',r.equipment),
        textField('Observações adicionais',r.notes)
      ].filter(Boolean).join('');
      return '<article class="handover-card '+priorityClass(r.priority)+'"><div class="handover-card-head"><div><div class="handover-card-title">'+escapeHtml(r.protocol)+' · '+escapeHtml(r.shift)+' · '+formatDate(r.date)+'</div><div class="handover-card-meta">Passado por: '+escapeHtml(r.outgoing)+' · Recebido por: '+escapeHtml(r.incoming||'Não informado')+' · Horário: '+escapeHtml(r.start||'--:--')+' às '+escapeHtml(r.end||'--:--')+'</div></div><div><span class="'+priorityTag(r.priority)+'">'+escapeHtml(r.priority)+'</span> <span class="'+(r.status==='received'?'tag done':'tag pending')+'">'+statusLabel(r.status)+'</span></div></div>'+(details?'<div class="handover-card-body">'+details+'</div>':'<p class="muted">Sem ocorrências ou pendências descritas.</p>')+'<div class="handover-actions">'+(r.status!=='received'?'<button type="button" class="primary sm" data-handover-receive="'+escapeHtml(r.id)+'">Confirmar recebimento</button>':'<span class="muted">Recebido por '+escapeHtml(r.receivedBy||'responsável não identificado')+' em '+escapeHtml(r.receivedAt||'data não informada')+'</span>')+'<button type="button" class="secondary sm" data-handover-print="'+escapeHtml(r.id)+'">Imprimir passagem</button></div></article>';
    }).join(''):'<p class="section-empty">Nenhuma passagem de plantão encontrada.</p>';
  }
  function renderAll(){renderStats();renderRecords();}
  function save(event){
    event.preventDefault();
    const outgoing=$('handoverOutgoing').value.trim();
    if(!outgoing){showMsg($('handoverMessage'),'Informe quem está passando o plantão.','err');return;}
    const records=db.shiftHandovers||(db.shiftHandovers=[]);
    const protocol='PLT-'+String(records.length+1).padStart(6,'0');
    const record={
      id:'plt_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      protocol,date:$('handoverDate').value,shift:$('handoverShift').value,
      outgoing,incoming:$('handoverIncoming').value.trim(),
      start:$('handoverStart').value,end:$('handoverEnd').value,
      priority:$('handoverPriority').value,status:$('handoverStatus').value,
      occurrences:$('handoverOccurrences').value.trim(),
      pendingTasks:$('handoverPendingTasks').value.trim(),
      stock:$('handoverStock').value.trim(),
      equipment:$('handoverEquipment').value.trim(),
      notes:$('handoverNotes').value.trim(),
      createdAt:new Date().toISOString(),createdBy:db.activeOperator
    };
    records.unshift(record);
    addAudit('Passagem de plantão registrada',protocol+' · '+record.shift+' · '+outgoing);
    saveDb();resetForm();renderAll();
    showMsg($('handoverMessage'),'Passagem '+protocol+' salva com sucesso.','ok');
  }
  function receive(id){
    const record=(db.shiftHandovers||[]).find(x=>x.id===id);
    if(!record||record.status==='received')return;
    if(!confirm('Confirmar que você recebeu a passagem '+record.protocol+'?'))return;
    record.status='received';record.receivedBy=db.activeOperator;record.receivedAt=new Date().toLocaleString('pt-BR');
    addAudit('Recebimento de passagem de plantão',record.protocol+' recebido por '+db.activeOperator);
    saveDb();renderAll();
  }
  function printRecord(id){
    const r=(db.shiftHandovers||[]).find(x=>x.id===id);if(!r)return;
    const fields=[['Ocorrências',r.occurrences],['Pendências',r.pendingTasks],['Materiais / estoque',r.stock],['Equipamentos / empréstimos',r.equipment],['Observações',r.notes]].filter(x=>x[1]);
    const w=window.open('','_blank','width=900,height=700');
    if(!w){alert('Permita a abertura de janelas para imprimir a passagem.');return;}
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+escapeHtml(r.protocol)+'</title><style>body{font:14px Arial,sans-serif;color:#17251e;margin:32px}h1{color:#075b3b;font-size:22px}h2{font-size:15px;margin:18px 0 5px}p{white-space:pre-wrap;line-height:1.5}.meta{background:#f1f6f3;padding:12px;border:1px solid #d5e0da;border-radius:8px}@media print{button{display:none}}</style></head><body><h1>Passagem de Plantão · '+escapeHtml(r.protocol)+'</h1><div class="meta"><b>Data:</b> '+formatDate(r.date)+' · <b>Turno:</b> '+escapeHtml(r.shift)+' · <b>Horário:</b> '+escapeHtml(r.start||'--:--')+' às '+escapeHtml(r.end||'--:--')+'<br><b>Passado por:</b> '+escapeHtml(r.outgoing)+'<br><b>Recebido por:</b> '+escapeHtml(r.incoming||'Não informado')+'<br><b>Prioridade:</b> '+escapeHtml(r.priority)+' · <b>Situação:</b> '+statusLabel(r.status)+'</div>'+fields.map(x=>'<h2>'+x[0]+'</h2><p>'+escapeHtml(x[1])+'</p>').join('')+'<p style="margin-top:35px">Assinatura de quem passou: ____________________________<br><br>Assinatura de quem recebeu: ____________________________</p><script>window.onload=()=>window.print();<\/script></body></html>');
    w.document.close();
  }
  function exportCsv(){
    const rows=[['Protocolo','Data','Turno','Passado por','Recebido por','Início','Fim','Prioridade','Situação','Ocorrências','Pendências','Estoque','Equipamentos','Observações'],...(db.shiftHandovers||[]).map(r=>[r.protocol,r.date,r.shift,r.outgoing,r.incoming,r.start,r.end,r.priority,statusLabel(r.status),r.occurrences,r.pendingTasks,r.stock,r.equipment,r.notes])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='passagens_de_plantao.csv';a.click();URL.revokeObjectURL(url);
  }
  $('handoverForm').addEventListener('submit',save);
  $('handoverClearBtn').addEventListener('click',resetForm);
  $('handoverSearch').addEventListener('input',renderRecords);
  $('handoverFilter').addEventListener('change',renderRecords);
  $('handoverExportBtn').addEventListener('click',exportCsv);
  $('handoverRecords').addEventListener('click',event=>{
    const receiveBtn=event.target.closest('[data-handover-receive]');
    const printBtn=event.target.closest('[data-handover-print]');
    if(receiveBtn)receive(receiveBtn.dataset.handoverReceive);
    if(printBtn)printRecord(printBtn.dataset.handoverPrint);
  });
  resetForm();renderAll();
  return renderAll;
})();
