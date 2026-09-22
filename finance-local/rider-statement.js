// Canonical statement model: Excel is the master table; PDF consumes the same rows.
async function prepareRiderStatement(payload, jobsReady = null) {
  if(payload.panelTitle==='Commission Rider'&&payload.statementScope?.rider){
    const name=payload.statementScope.rider.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,160)||'Rider';
    if(payload.filename!==name||payload.pdfFilename!==name+'.pdf')payload={...payload,filename:name,pdfFilename:name+'.pdf'};
  }
  if(payload.statementPrepared || payload.panelTitle!=='Commission Rider' || !payload.summary || !payload.columns.some(column=>column.key==='commission'))return payload;
  const scope=payload.statementScope;
  if(!scope?.rider || !scope.start || !scope.end)throw new Error('A rider and commission period are required for a complete statement.');
  await (jobsReady || additionalJobsLoad(true));
  const jobs=additionalJobsForScope(scope.rider,scope.start,scope.end),index=payload.columns.findIndex(column=>column.key==='commission');
  const row=(label,value)=>payload.columns.map((_,i)=>i===0?label:i===index?value:'');
  const clean=value=>typeof value==='string'?value.replace(/\s*\(applied\)/gi,'').replace(/APPLIED DEDUCTIONS|TOTAL DEDUCTED/gi,'TOTAL DEDUCTIONS'):value;
  let footerRows=(payload.footerRows||[payload.footer]).filter(Boolean).map(row=>row.map(clean));
  footerRows=footerRows.filter(row=>!/^net commission$/i.test(String(row[0])));
  const extras=jobs.reduce((sum,job)=>sum+job.amountCents,0);
  const baseNet=Math.round(Number(String(payload.summary.value).replace(/[^\d.-]/g,''))*100);
  if(!Number.isSafeInteger(baseNet+extras))throw new Error('Statement total is outside the supported currency range.');
  const totalIndex=footerRows.findIndex(row=>/^total deductions$/i.test(String(row[0])));
  if(totalIndex<0)footerRows.push(row('TOTAL DEDUCTIONS',deductionMoney(0)));
  footerRows.push(...jobs.map((job,i)=>row('ADDITIONAL JOB '+(i+1)+' · '+job.reference+' · '+job.description,'+ '+deductionMoney(job.amountCents))));
  if(jobs.length)footerRows.push(row('TOTAL ADDITIONAL JOBS','+ '+deductionMoney(extras)));
  footerRows.push(row('NET COMMISSION',deductionMoney(baseNet+extras)));
  return {...payload,title:scope.rider,statementPrepared:true,sourceRowCount:payload.rows.length,rows:[...payload.rows],footerRows,exportSummaryRows:[],summary:{label:'Net Commission',value:deductionMoney(baseNet+extras)}};
}

async function downloadMasterRiderExcel(payload) {
  if(!window.JSZip)throw new Error('Excel export is not ready. Please retry.');
  const zip=new window.JSZip(),logo=await financePdfLogo(),n=payload.columns.length,last=excelColumnReference(n-1);
  const widths=payload.columns.map(column=>{
    const key=String(column.key).toLowerCase();
    if(/created_at|request_at|dispatched_on/.test(key))return 20;
    if(/products|vehicle_name/.test(key))return 32;
    if(/rider_name|branch_name/.test(key))return 25;
    if(/status|payment_type|promocode/.test(key))return 20;
    return Math.min(22,Math.max(14,String(column.label).length+3));
  });
  // Excel does not auto-fit custom-height wrapped rows on opening the workbook.
  // Size each row for the longest wrapped cell, including explicit date/time lines.
  const wrappedLines=(value,width)=>String(value??'').split(/\r?\n/).reduce((total,line)=>{
    const capacity=Math.max(8,Math.floor(width*.8));let lines=1,used=0;
    for(const word of line.split(/\s+/)){
      if(used&&used+1+word.length>capacity){lines++;used=0;}
      if(word.length>capacity){lines+=Math.floor((word.length-1)/capacity);used=(word.length-1)%capacity+1;}
      else used+=(used?1:0)+word.length;
    }
    return total+lines;
  },0);
  const tableValues=row=>payload.columns.map(column=>{
    const value=financeExcelCellValue(column,row,payload.panelTitle);
    return typeof value==='string'&&/created_at|request_at|dispatched_on/.test(column.key)?value.replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/,'$1\n$2'):value;
  });
  const rows=[],merges=[];
  const add=(values,style=0,height=20)=>{const number=rows.length+1;rows.push(`<row r="${number}" customHeight="1" ht="${height}">${values.map((value,i)=>xlsxCellXml(value,excelColumnReference(i)+number,(typeof style==='function'?style(i):style))).join('')}</row>`);return number;};
  add([],0,40);add([payload.panelTitle],4,24);add([payload.title],4,24);add([payload.period],7,Math.max(32,wrappedLines(payload.period,widths.reduce((a,b)=>a+b,0))*14+10));
  if(n>1)for(const number of [1,2,3,4])merges.push(`A${number}:${last}${number}`);
  const header=add(payload.columns.map(column=>column.label),1,30);
  payload.rows.forEach(row=>{
    const values=tableValues(row);
    const height=Math.max(32,...values.map((value,i)=>wrappedLines(value,widths[i])*14+10));
    const number=add(values,0,Math.min(409,height));
    const index=payload.columns.findIndex(column=>column.key==='commission');
    if(row.__additionalJob&&index>1)merges.push(`A${number}:${excelColumnReference(index-1)}${number}`);
  });
  for(const footer of payload.footerRows){
    const label=String(footer[0]||'').toUpperCase(),style=label==='TOTAL DEDUCTIONS'?3:label==='NET COMMISSION'?6:label.startsWith('ADDITIONAL JOB')||label==='TOTAL ADDITIONAL JOBS'?5:2;
    const pair={2:8,3:10,5:12,6:14}[style];
    const number=add(footer,i=>pair+(i===0?0:1),Math.max(24,wrappedLines(label,widths.slice(0,-1).reduce((a,b)=>a+b,0))*14+10));
    const firstValue=footer.findIndex((value,index)=>index>0&&value!=='');
    if(firstValue>1)merges.push(`A${number}:${excelColumnReference(firstValue-1)}${number}`);
  }
  const ns='http://schemas.openxmlformats.org/',rel=ns+'package/2006/relationships',docrel=ns+'officeDocument/2006/relationships';
  zip.file('[Content_Types].xml',`<Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip.file('_rels/.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml',`<workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${docrel}"><sheets><sheet name="Rider Statement" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${docrel}/styles" Target="styles.xml"/></Relationships>`);
  const fills=['1D4ED8','174C3B','D9952F','FFFFFF','12754B','FFEB3B'];
  zip.file('xl/styles.xml',`<styleSheet xmlns="${ns}spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FF142135"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(color=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="2"><border><left style="thin"><color rgb="FFDADFE5"/></left><right style="thin"><color rgb="FFDADFE5"/></right><top style="thin"><color rgb="FFDADFE5"/></top><bottom style="thin"><color rgb="FFDADFE5"/></bottom><diagonal/></border><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="16">${[0,2,3,4,5,6,7,0].map((fill,index)=>`<xf numFmtId="0" fontId="${[0,7].includes(index)?0:[3,4,6].includes(index)?2:1}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="${[4,7].includes(index)?'left':'center'}" vertical="center" wrapText="1"/></xf>`).join('')}${[3,4,6,7].map((fill,index)=>['left','right'].map(align=>`<xf numFmtId="0" fontId="${index===1||index===3?2:1}" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`).join('')).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${docrel}"><sheetPr><pageSetUpPr autoPageBreaks="0"/></sheetPr><sheetViews><sheetView workbookViewId="0" view="normal" zoomScale="100" zoomScaleNormal="100" showGridLines="1"/></sheetViews><cols>${payload.columns.map((column,index)=>`<col min="${index+1}" max="${index+1}" width="${widths[index]}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A${header}:${last}${header+payload.rows.length}"/><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><drawing r:id="rId1"/></worksheet>`);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/image" Target="../media/logo.png"/></Relationships>`);
  zip.file('xl/media/logo.png',logo.split(',')[1],{base64:true});
  zip.file('xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="${ns}drawingml/2006/spreadsheetDrawing" xmlns:a="${ns}drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>40000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>40000</xdr:rowOff></xdr:from><xdr:ext cx="2324100" cy="358140"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Bateriku logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${docrel}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=(payload.pdfFilename?.replace(/\.pdf$/i,'')||payload.filename)+'.xlsx';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(link.href);return true;
}
