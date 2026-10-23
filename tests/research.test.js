import test from 'node:test';import assert from 'node:assert/strict';import {summarizeGames,evaluateProp,evaluateParlay} from '../src/lib/research.js';
test('summarizes windows without fabricating data',()=>{const v=summarizeGames([28,20,31,22,25],24.5);assert.equal(v.last5.over,3);assert.equal(v.last5.under,2);assert.equal(v.last10.games,5)});
test('refuses prediction verdict without calibrated research',()=>{const r=evaluateProp({values:[21,31],line:25.5,odds:-110});assert.equal(r.verdict,'INSUFFICIENT DATA');assert.equal(r.modelProbability,null)});
test('ignores uncalibrated probability',()=>{const r=evaluateProp({values:[22],line:24.5,odds:-110,modelProbability:.9});assert.equal(r.modelProbability,null)});
test('rejects unvalidated parlay legs',()=>assert.throws(()=>evaluateParlay([{odds:-110,probability:.6},{odds:110,probability:.6}])));
test('warns about same-event correlation',()=>{const r=evaluateParlay([{odds:-110,probability:.6,calibrated:true,eventId:'game1'},{odds:120,probability:.5,calibrated:true,eventId:'game1'}]);assert.equal(r.correlationWarning,true);assert.equal(r.recommendation,'REVIEW ONLY')});
