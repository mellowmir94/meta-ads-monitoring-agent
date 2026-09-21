// Canonical statement model: Excel is the master table; PDF consumes the same rows.
async function prepareRiderStatement(payload) {
  if(payload.statementPrepared || payload.panelTitle!=='Commission Rider' || !payload.summary || !payload.columns.some(column=>column.key==='commission'))return payload;
  const scope=payload.statementScope;
  if(!scope?.rider || !scope.start || !scope.end)throw new Error('A rider and commission period are required for a complete statement.');
  await additionalJobsLoad(true);
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
  const rows=[],merges=[];
  const add=(values,style=0,height=20)=>{const number=rows.length+1;rows.push(`<row r="${number}" customHeight="1" ht="${height}">${values.map((value,i)=>xlsxCellXml(value,excelColumnReference(i)+number,style)).join('')}</row>`);return number;};
  add([],0,34);add([payload.panelTitle],4,24);add([payload.title],4,24);add([payload.period],0,40);
  if(n>1)for(const number of [1,2,3,4])merges.push(`A${number}:${last}${number}`);
  const header=add(payload.columns.map(column=>column.label),1,30);
  payload.rows.forEach(row=>{
    const number=add(payload.columns.map(column=>financeExcelCellValue(column,row,payload.panelTitle)),0,row.__additionalJob?Math.max(40,Math.ceil(row.description.length/80)*16):20);
    const index=payload.columns.findIndex(column=>column.key==='commission');
    if(row.__additionalJob&&index>1)merges.push(`A${number}:${excelColumnReference(index-1)}${number}`);
  });
  for(const footer of payload.footerRows){
    const label=String(footer[0]||'').toUpperCase(),style=label==='TOTAL DEDUCTIONS'?3:label==='NET COMMISSION'?6:label.startsWith('ADDITIONAL JOB')||label==='TOTAL ADDITIONAL JOBS'?5:2;
    const number=add(footer,style,label.startsWith('ADDITIONAL JOB')?Math.max(40,Math.ceil(label.length/Math.max(20,(n-1)*16))*16):24);
    const firstValue=footer.findIndex((value,index)=>index>0&&value!=='');
    if(firstValue>1)merges.push(`A${number}:${excelColumnReference(firstValue-1)}${number}`);
  }
  const ns='http://schemas.openxmlformats.org/',rel=ns+'package/2006/relationships',docrel=ns+'officeDocument/2006/relationships';
  zip.file('[Content_Types].xml',`<Types xmlns="${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip.file('_rels/.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml',`<workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${docrel}"><sheets><sheet name="Rider Statement" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${docrel}/styles" Target="styles.xml"/></Relationships>`);
  const fills=['1D4ED8','174C3B','D9952F','FFFFFF','12754B','FFEB3B'];
  zip.file('xl/styles.xml',`<styleSheet xmlns="${ns}spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF142135"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(color=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">${[0,2,3,4,5,6,7].map((fill,index)=>`<xf numFmtId="0" fontId="${index===0?0:[3,4,6].includes(index)?2:1}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${docrel}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${header}" topLeftCell="A${header+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${payload.columns.map((column,index)=>`<col min="${index+1}" max="${index+1}" width="${Math.min(32,Math.max(14,String(column.label).length+3))}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A${header}:${last}${header+payload.rows.length}"/><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/><drawing r:id="rId1"/></worksheet>`);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docrel}/image" Target="../media/logo.png"/></Relationships>`);
  zip.file('xl/media/logo.png',logo.split(',')[1],{base64:true});
  zip.file('xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="${ns}drawingml/2006/spreadsheetDrawing" xmlns:a="${ns}drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>40000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>40000</xdr:rowOff></xdr:from><xdr:ext cx="2324100" cy="358140"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Bateriku logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${docrel}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=(payload.pdfFilename?.replace(/\.pdf$/i,'')||payload.filename)+'.xlsx';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(link.href);return true;
}
