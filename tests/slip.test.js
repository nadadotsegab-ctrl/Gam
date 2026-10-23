import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSlip} from '../src/lib/slip.js';

test('two -110 legs produce correct illustrative payout math',()=>{
 const slip=calculateSlip([{selection:'A over 24.5',event:'A vs B',odds:'-110'},{selection:'C under 8.5',event:'C vs D',odds:'-110'}],10);
 assert.ok(Math.abs(slip.payoutMultiplier-(1+100/110)**2)<1e-10);
 assert.ok(Math.abs(slip.potentialPayout-10*slip.payoutMultiplier)<1e-10);
 assert.ok(slip.warnings.some(w=>w.includes('probability is unknown')));
});
test('repeated game triggers correlation warning',()=>{
 const x=calculateSlip([{selection:'A points over',event:'A vs B',odds:'-110'},{selection:'B rebounds over',event:'A vs B',odds:'+140'}],10);
 assert.ok(x.warnings.some(w=>w.includes('same event')));
});
test('missing odds and empty selections never compute returns',()=>{
 assert.throws(()=>calculateSlip([{selection:'A',odds:''},{selection:'B',odds:'-110'}],10));
 assert.throws(()=>calculateSlip([{selection:'',odds:'-110'},{selection:'B',odds:'-110'}],10));
});
test('rejects invalid stake and extra legs',()=>{
 const legs=Array.from({length:9},(_,i)=>({selection:String(i),odds:-110}));
 assert.throws(()=>calculateSlip(legs,10));
 assert.throws(()=>calculateSlip(legs.slice(0,2),0));
});
