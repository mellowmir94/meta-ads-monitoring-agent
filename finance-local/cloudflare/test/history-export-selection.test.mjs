import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../deductions.js',import.meta.url),'utf8');
const start=source.indexOf("document.addEventListener('change', event => {\n  const checkbox =");
assert.ok(start>=0);
const selectionHandler=source.slice(start,source.indexOf('\nfunction deductionHistoryWarmDownloadFromIntent',start));
function fixture({loaded=true,failWarmup=false,jobs=false}={}){
  let handler;
  const button={disabled:true},selected=new Set(),row={dataset:jobs?{jobSelectionId:'jobs:a'}:{deductionBatchId:'a'}};
  const checkbox={checked:true,closest:()=>row},other={checked:true};
  const context=vm.createContext({Promise,document:{addEventListener:(_event,fn)=>{handler=fn;},querySelectorAll:()=>[checkbox,other]},
    deductionState:{loaded},deductionHistorySelected:selected,
    deductionHistoryEnsure:()=>({querySelector:()=>button}),
    deductionHistoryPrefetchRow:()=>{if(failWarmup)throw new Error('Background preparation failed');},
  });
  vm.runInContext(selectionHandler,context);
  return {button,selected,checkbox,other,change:()=>handler({target:{closest:()=>checkbox}})};
}
for(const jobs of [false,true])test(`selecting ${jobs?'job-only':'deduction'} rider enables export even if optional warmup fails`,async()=>{
  const f=fixture({failWarmup:true,jobs});
  assert.doesNotThrow(f.change);
  await Promise.resolve();
  assert.equal(f.button.disabled,false);
  assert.equal(f.other.checked,false);
  assert.equal(f.selected.size,1);
  f.checkbox.checked=false;f.change();assert.equal(f.button.disabled,true);
});
test('incomplete register cannot enable PDF export',()=>{
  const f=fixture({loaded:false});f.change();assert.equal(f.button.disabled,true);
});
