import test from 'node:test'
import assert from 'node:assert/strict'
import {seed,apply,space,freeStock,product,rover} from './model.mjs'

test('Hub order: rejection, rerouting, alternate pickup, robot failure, issue and return',()=>{
 const s=seed(),act=(type,data={})=>apply(s,{type,...data})
 act('order',{product:3,to:'p2'})
 const o=s.orders[0],r=s.requests[0]
 assert.equal(freeStock(s,product(s,3),'hub'),11)
 act('offer',{ids:[r.id],place:'p3'})
 assert.equal(space(s,'p3').held,0)
 act('reply',{place:'p3',batch:r.batch,accept:false})
 assert.equal(r.target,'p1');assert.equal(space(s,'p3').held,0)
 act('reply',{place:'p1',batch:r.batch,accept:true})
 assert.equal(r.status,'Погрузка')
 act('ship',{request:r.id,place:'hub'})
 assert.throws(()=>act('receive',{request:r.id,place:'p1'}))
 apply(s,{type:'receive',request:r.id,place:'p1'},r.eta)
 assert.equal(space(s,'p1').pickup,8)
 assert.equal(o.status,'Предложение')
 assert.equal(freeStock(s,product(s,3),'p1'),0)
 act('choice',{order:o.id,accept:false})
 const local=s.requests.at(-1),args={ids:[local.id],robot:'R-01'}
 assert.throws(()=>act('trip',args))
 act('day')
 assert.throws(()=>act('trip',args),/не менее 3/)
 act('transfer',{product:1,qty:2,place:'p1',to:'p2'})
 args.ids.push(s.requests.at(-1).id)
 act('trip',args)
 const t=s.trips[0]
 act('ship',{request:local.id,place:'p1'});assert.equal(product(s,3).stock.p1,0)
 act('failure',{trip:t.id});assert.equal(product(s,3).stock.p1,1)
 act('trip',args);const t2=s.trips.at(-1)
 act('ship',{request:local.id,place:'p1'});apply(s,{type:'receive',request:local.id,place:'p2'},local.eta);const extra=s.requests.at(-1);apply(s,{type:'receive',request:extra.id,place:'p2'},extra.eta);assert.equal(t2.status,'Завершён')
 assert.equal(o.status,'Готов к выдаче');assert.equal(o.loc,'p2')
 act('issue',{order:o.id,place:'p2'})
 assert.throws(()=>act('issue',{order:o.id,place:'p2'}));assert.equal(s.ledger.length,1)
 act('return',{order:o.id,place:'p2'});assert.equal(product(s,3).stock.p2,1)
})
test('Local buyer accepts pickup and stock cannot be overbooked',()=>{
 const s=seed()
 apply(s,{type:'order',product:1,to:'p2'});const o=s.orders[0]
 apply(s,{type:'choice',order:o.id,accept:true})
 assert.equal(o.loc,'p1');assert.equal(o.status,'Готов к выдаче')
 assert.equal(freeStock(s,product(s,1),'p1'),11)
 assert.throws(()=>apply(s,{type:'transfer',product:1,place:'p1',to:'p3',qty:12}))
})
test('New listing, capacity reservation, grouped inbound and multi-stop route',()=>{
 const s=seed(),act=(type,a)=>apply(s,{type,...a})
 act('product',{name:'Кабель',category:'Электроника',qty:8,price:599,liters:999,dims:[10,10,10],place:'hub'})
 const p=s.products.at(-1)
 for(const to of ['p2','p3'])act('transfer',{product:p.id,place:'hub',qty:3,to})
 act('offer',{ids:s.requests.map(r=>r.id),place:'p1'})
 assert.equal(space(s,'p1').held,6)
 assert.throws(()=>act('capacity',{place:'p1',value:25}))
 act('reply',{batch:s.requests[0].batch,place:'p1',accept:true})
 for(const r of s.requests.filter(r=>r.kind==='Магистраль')){act('ship',{request:r.id,place:'hub'});apply(s,{type:'receive',request:r.id,place:r.target},r.eta)}
 const local=s.requests.filter(r=>r.kind==='Робот')
 act('trip',{ids:local.map(r=>r.id),robot:'R-01'})
 assert.deepEqual(new Set(s.trips[0].route),new Set(['p1','p2','p3']))
 act('ship',{request:local[0].id,place:'p1'})
 for(const r of local)apply(s,{type:'receive',request:r.id,place:r.to},r.eta)
 assert.equal(s.trips[0].status,'Завершён')
 assert.deepEqual(p.stock,{hub:2,p1:0,p2:3,p3:3})
})
test('All points reject: retry after capacity changes; local shipment via hub',()=>{
 const s=seed(),act=(type,a)=>apply(s,{type,...a})
 act('transfer',{product:1,qty:2,place:'p1',to:'p2'})
 const r=s.requests[0];act('viaHub',{ids:[r.id]});act('offer',{ids:[r.id],place:'p2'})
 act('reply',{place:'p2',batch:r.batch,accept:false});act('reply',{place:'p3',batch:r.batch,accept:false})
 assert.equal(r.status,'Ожидает места')
 act('offer',{ids:[r.id],place:'p2'});act('reply',{place:'p2',batch:r.batch,accept:true})
 act('ship',{request:r.id,place:'p1'});apply(s,{type:'receive',request:r.id,place:'p2'},r.eta)
 assert.equal(product(s,1).stock.p2,2)
})


test('Pickup on full mini-warehouse, parties, time and repeat receipts',()=>{
 const s=seed(),act=(type,a)=>apply(s,{type,...a},5000)
 act('capacity',{place:'p2',value:12})
 act('order',{product:3,to:'p2'})
 const r=s.requests[0]
 assert.throws(()=>act('offer',{ids:[r.id],purpose:'storage',place:'p2'}))
 act('offer',{ids:[r.id],purpose:'pickup',place:'p2'})
 act('reply',{place:'p2',batch:r.batch,accept:true})
 assert.throws(()=>act('ship',{request:r.id,place:'p3'}))
 act('ship',{request:r.id,place:'hub'})
 assert.throws(()=>apply(s,{type:'receive',place:'p3',request:r.id},r.eta))
 assert.throws(()=>apply(s,{type:'receive',place:'p2',request:r.id},r.eta-1))
 apply(s,{type:'receive',place:'p2',request:r.id},r.eta)
 assert.throws(()=>apply(s,{type:'receive',place:'p2',request:r.id},r.eta))
 assert.deepEqual(space(s,'p2'),{used:12,held:0,pickup:8,free:0})
 act('issue',{order:r.order,place:'p2'})
 assert.equal(space(s,'p2').pickup,0)
})

test('Rover rejects oversize items and enforces cargo limits',()=>{
 const s=seed()
 const trip=(dims,qty)=>{
  apply(s,{type:'product',name:'Тестовая упаковка',category:'Дом',dims,qty,price:100,place:'p1'})
  apply(s,{type:'transfer',product:s.products.at(-1).id,qty,place:'p1',to:'p2'})
  apply(s,{type:'trip',ids:[s.requests.at(-1).id],robot:'R-01'})
 }
 // Give the fixture sufficient storage at both pickup offices.
 for(const id of ['p1','p2'])apply(s,{type:'capacity',place:id,value:1500})
 assert.equal(rover.liters,375.584)
 assert.throws(()=>trip([89,1,1],3),/не помещается/)
 assert.throws(()=>trip([55,55,55],3),/Общий объём/)
 trip([55,88,77.6/3],3)
 assert.equal(s.trips.length,1)
})
