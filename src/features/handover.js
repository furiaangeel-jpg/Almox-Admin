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
  const isValidated = record => record.supervisorValidated === true || record.status === 'validated';
  const statusLabel = record => isValidated(record) ? 'Validada pelo supervisor' : 'Aguardando validação';
  const priorityClass = p => p==='Alta'?'priority-high':p==='Atenção'?'priority-attention':'';
  const priorityTag = p => p==='Alta'?'tag exp-err':p==='Atenção'?'tag pending':'tag done';
  const textField = (label,value) => value?'<div class="handover-field"><strong>'+label+'</strong><p>'+escapeHtml(value)+'</p></div>':'';
  const notesField = value => '<div class="handover-field"><strong>Notas fiscais recebidas</strong><p>'+Number(value||0)+'</p></div>';

  function resetForm(){
    $('handoverForm').reset();
    $('handoverDate').value=today();
    $('handoverShift').value='12x36';
    $('handoverOutgoing').value=db.activeOperator||'';
    $('handoverPriority').value='Normal';
    $('handoverNotesReceived').value='0';
    clearMsg($('handoverMessage'));
  }

  function renderStats(){
    const records=db.shiftHandovers||[];
    const pending=records.filter(x=>!isValidated(x));
    const validated=records.length-pending.length;
    $('handoverTotal').textContent=records.length;
    $('handoverPending').textContent=pending.length;
    $('handoverReceived').textContent=validated;
    $('handoverUrgent').textContent=pending.filter(x=>x.priority==='Alta').length;
    const badge=$('handoverOpenBadge');
    badge.hidden=pending.length===0;
    badge.textContent=pending.length+' pendente'+(pending.length===1?'':'s');
  }

  function renderRecords(){
    const query=$('handoverSearch').value.trim().toLocaleLowerCase('pt-BR');
    const filter=$('handoverFilter').value;
    const records=(db.shiftHandovers||[]).filter(r=>{
      if(filter==='validated'&&!isValidated(r))return false;
      if(filter==='pending'&&isValidated(r))return false;
      return !query||[r.protocol,r.outgoing,r.shift,r.occurrences,r.pendingTasks,r.stock,r.notes,r.notesReceived].join(' ').toLocaleLowerCase('pt-BR').includes(query);
    }).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));

    $('handoverRecords').innerHTML=records.length?records.map(r=>{
      const details=[
        notesField(r.notesReceived),
        textField('Ocorrências do plantão',r.occurrences),
        textField('Pendências para o próximo plantão',r.pendingTasks),
        textField('Materiais / estoque',r.stock),
        textField('Observações adicionais',r.notes)
      ].filter(Boolean).join('');
      const validated=isValidated(r);
      const validationInfo=validated
        ? '<div class="handover-validation">Validada por <strong>'+escapeHtml(r.validatedBy||'Supervisor')+'</strong> em '+escapeHtml(r.validatedAt||'data não informada')+'</div>'
        : '<div class="handover-validation pending">Aguardando conferência do líder do setor.</div>';
      const action=validated
        ? '<span class="muted">Validação concluída</span>'
        : '<button type="button" class="primary sm" data-handover-validate="'+escapeHtml(r.id)+'">Validar como supervisor</button>';
      return '<article class="handover-card '+priorityClass(r.priority)+'"><div class="handover-card-head"><div><div class="handover-card-title">'+escapeHtml(r.protocol)+' · Escala 12x36 · '+formatDate(r.date)+'</div><div class="handover-card-meta">Passado por: '+escapeHtml(r.outgoing)+' · Horário: '+escapeHtml(r.start||'--:--')+' às '+escapeHtml(r.end||'--:--')+'</div></div><div><span class="'+priorityTag(r.priority)+'">'+escapeHtml(r.priority||'Normal')+'</span> <span class="'+(validated?'tag done':'tag pending')+'">'+statusLabel(r)+'</span></div></div>'+(details?'<div class="handover-card-body">'+details+'</div>':'<p class="muted">Sem ocorrências ou pendências descritas.</p>')+validationInfo+'<div class="handover-actions">'+action+'<button type="button" class="secondary sm" data-handover-print="'+escapeHtml(r.id)+'">Imprimir passagem</button></div></article>';
    }).join(''):'<p class="section-empty">Nenhuma passagem de plantão encontrada.</p>';
  }

  function renderAll(){renderStats();renderRecords();}

  function withSupervisorValidation(onValid){
    runWithPin('Selecione o operador responsável pela validação. É necessário possuir perfil Supervisor.', confirmedName=>{
      const supervisor=db.users.find(user=>user.name===confirmedName&&user.active!==false);
      if(!supervisor||supervisor.role!=='Supervisor'){
        alert('Validação não realizada. Selecione um operador cadastrado com perfil Supervisor.');
        return;
      }
      onValid(confirmedName);
    });
  }

  function persistRecord(validatedBy=null){
    const outgoing=$('handoverOutgoing').value.trim();
    const notesReceived=Number($('handoverNotesReceived').value);
    if(!outgoing){showMsg($('handoverMessage'),'Informe quem está passando o plantão.','err');return;}
    if(!Number.isInteger(notesReceived)||notesReceived<0){showMsg($('handoverMessage'),'Informe uma quantidade válida de notas fiscais recebidas (zero ou mais).','err');return;}

    const records=db.shiftHandovers||(db.shiftHandovers=[]);
    const nextNumber=records.reduce((max,r)=>{
      const match=/^PLT-(\d+)$/.exec(r.protocol||'');
      return match?Math.max(max,Number(match[1])):max;
    },0)+1;
    const protocol='PLT-'+String(nextNumber).padStart(6,'0');
    const record={
      id:'plt_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      protocol,date:$('handoverDate').value,shift:'12x36',
      outgoing,start:$('handoverStart').value,end:$('handoverEnd').value,
      priority:$('handoverPriority').value,
      notesReceived,
      occurrences:$('handoverOccurrences').value.trim(),
      pendingTasks:$('handoverPendingTasks').value.trim(),
      stock:$('handoverStock').value.trim(),
      notes:$('handoverNotes').value.trim(),
      supervisorValidated:Boolean(validatedBy),
      status:validatedBy?'validated':'pending',
      validatedBy:validatedBy||'',
      validatedAt:validatedBy?new Date().toLocaleString('pt-BR'):'',
      createdAt:new Date().toISOString(),createdBy:db.activeOperator
    };
    records.unshift(record);
    addAudit('Passagem de plantão registrada',protocol+' · 12x36 · '+outgoing);
    if(validatedBy)addAudit('Passagem de plantão validada',protocol+' validada por '+validatedBy,validatedBy);
    saveDb();resetForm();renderAll();
    showMsg($('handoverMessage'),'Passagem '+protocol+' salva com sucesso'+(validatedBy?' e validada pelo supervisor.':'. Aguardando validação do supervisor.'));
  }

  function save(event){
    event.preventDefault();
    if($('handoverSupervisorCheck').checked){
      withSupervisorValidation(name=>persistRecord(name));
    }else{
      persistRecord();
    }
  }

  function validateRecord(id){
    const record=(db.shiftHandovers||[]).find(x=>x.id===id);
    if(!record||isValidated(record))return;
    withSupervisorValidation(name=>{
      record.supervisorValidated=true;
      record.status='validated';
      record.validatedBy=name;
      record.validatedAt=new Date().toLocaleString('pt-BR');
      addAudit('Passagem de plantão validada',record.protocol+' validada por '+name,name);
      saveDb();renderAll();
    });
  }

  function printRecord(id){
    const r=(db.shiftHandovers||[]).find(x=>x.id===id);if(!r)return;
    const fields=[
      ['Quantidade de notas fiscais recebidas',String(Number(r.notesReceived||0))],
      ['Ocorrências do plantão',r.occurrences],
      ['Pendências para o próximo plantão',r.pendingTasks],
      ['Materiais em falta / reposição / estoque',r.stock],
      ['Observações adicionais',r.notes]
    ].filter(x=>x[1]);
    const validated=isValidated(r);
    const validationText=validated
      ? 'Validada por '+escapeHtml(r.validatedBy||'Supervisor')+' em '+escapeHtml(r.validatedAt||'data não informada')
      : 'Aguardando validação do supervisor';
    const w=window.open('','_blank','width=900,height=700');
    if(!w){alert('Permita a abertura de janelas para imprimir a passagem.');return;}
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+escapeHtml(r.protocol)+'</title><style>body{font:14px Arial,sans-serif;color:#17251e;margin:32px}h1{color:#075b3b;font-size:22px}h2{font-size:15px;margin:18px 0 5px}p{white-space:pre-wrap;line-height:1.5}.meta{background:#f1f6f3;padding:12px;border:1px solid #d5e0da;border-radius:8px}.validation{margin-top:14px;padding:10px;background:#f7faf8;border:1px solid #d5e0da;border-radius:8px}@media print{button{display:none}}</style></head><body><h1>Passagem de Plantão · '+escapeHtml(r.protocol)+'</h1><div class="meta"><b>Data:</b> '+formatDate(r.date)+' · <b>Escala:</b> 12x36 · <b>Horário:</b> '+escapeHtml(r.start||'--:--')+' às '+escapeHtml(r.end||'--:--')+'<br><b>Passado por:</b> '+escapeHtml(r.outgoing)+'<br><b>Prioridade:</b> '+escapeHtml(r.priority||'Normal')+'</div>'+fields.map(x=>'<h2>'+x[0]+'</h2><p>'+escapeHtml(x[1])+'</p>').join('')+'<div class="validation">'+validationText+'</div><p style="margin-top:35px">Assinatura do responsável que passou: ____________________________<br><br>Assinatura do supervisor: ____________________________</p><script>window.onload=()=>window.print();<\/script></body></html>');
    w.document.close();
  }

  function exportCsv(){
    const rows=[['Protocolo','Data','Escala','Passado por','Início','Fim','Prioridade','Notas fiscais recebidas','Situação da validação','Validado por','Data da validação','Ocorrências','Pendências','Materiais / estoque','Observações'],...(db.shiftHandovers||[]).map(r=>[
      r.protocol,r.date,'12x36',r.outgoing,r.start,r.end,r.priority,Number(r.notesReceived||0),
      statusLabel(r),r.validatedBy,r.validatedAt,r.occurrences,r.pendingTasks,r.stock,r.notes
    ])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='passagens_de_plantao.csv';a.click();URL.revokeObjectURL(url);
  }

  $('handoverForm').addEventListener('submit',save);
  $('handoverClearBtn').addEventListener('click',resetForm);
  $('handoverSearch').addEventListener('input',renderRecords);
  $('handoverFilter').addEventListener('change',renderRecords);
  $('handoverExportBtn').addEventListener('click',exportCsv);
  $('handoverRecords').addEventListener('click',event=>{
    const validateBtn=event.target.closest('[data-handover-validate]');
    const printBtn=event.target.closest('[data-handover-print]');
    if(validateBtn)validateRecord(validateBtn.dataset.handoverValidate);
    if(printBtn)printRecord(printBtn.dataset.handoverPrint);
  });
  resetForm();renderAll();
  return renderAll;
})();
