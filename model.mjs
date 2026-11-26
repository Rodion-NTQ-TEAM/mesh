export const categories = ['Электроника','Дом','Аксессуары']
export const stages = ['Погрузка','В пути','Разгрузка','Завершён']
const cargoDimensions = [88, 55, 77.6]
export const rover = {
  dimensions: cargoDimensions,
  liters: packingLiters(cargoDimensions),
  minUnits: 3,
  idealMin: 8,
  idealMax: 14
}
const sortedCargoDimensions = [...cargoDimensions].sort((a,b)=>a-b)

export function seed(){
  const places = [
    ['hub','Распределительный хаб','Казань',0,0,100000],
    ['p1','Центральный','Йошкар-Ола',2,3,200],
    ['p2','Заречный','Йошкар-Ола',4,4,150],
    ['p3','Парковый','Йошкар-Ола',1,5,120],
    ['p4','Университетский','Казань',3,2,160],
    ['p5','Северный','Казань',4,5,120]
  ].map(([id,name,city,x,y,capacity])=>({id,name,city,x,y,capacity}))
  const products=[
    ['Наушники Studio','Электроника',2490,2,'p1','🎧'],
    ['Термокружка Daily','Дом',990,1,'p2','☕'],
    ['Рюкзак City','Аксессуары',2190,8,'hub','🎒'],
    ['Лампа Orbit','Дом',1590,3,'p3','💡'],
    ['Зарядка USB-C','Электроника',890,2,'hub','🔌'],
    ['Часы Motion','Аксессуары',1790,1,'p4','⌚']
  ].map(([name,category,price,liters,loc,icon],i)=>({id:i+1,name,category,price,liters,icon,dims:[10,10,liters*10],stock:{[loc]:12},day:0}))
  return {places,products,orders:[],requests:[],trips:[],day:7,next:10,version:0,ledger:[],history:places.slice(1).flatMap((p,i)=>categories.map((category,j)=>({place:p.id,category,count:3+(i*7+j*11)%23})))}
}
function check(ok,msg){if(!ok)throw Error(msg)}
function number(v,min,max,integer=false){const n=Number(v);check(Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n)),'Проверьте числовое значение');return n}
export const place=(s,id)=>s.places.find(p=>p.id===id)
export const product=(s,id)=>s.products.find(p=>p.id===Number(id))
const active=r=>!['Доставлено','Отменено'].includes(r.status)
export function freeStock(s,p,loc){
  const orders=s.orders.filter(o=>o.product===p.id&&o.loc===loc&&!['Выдан','Возвращён','В пути'].includes(o.status)).length
  const reserved=s.requests.filter(r=>!r.order&&r.product===p.id&&r.from===loc&&active(r)&&!r.departed).reduce((a,r)=>a+r.qty,0)
  return (p.stock[loc]||0)-orders-reserved
}
export function space(s,id){
  const pickup=s.orders.filter(o=>o.pickup&&o.loc===id&&!['Выдан','Возвращён','В пути'].includes(o.status)).reduce((n,o)=>n+product(s,o.product).liters,0)
  const used=-pickup+s.products.reduce((n,p)=>n+(p.stock[id]||0)*p.liters,0)
  const held=s.requests.filter(r=>active(r)&&r.purpose!=='pickup'&&r.target===id&&['Согласование','Погрузка','В пути','Разгрузка'].includes(r.status)).reduce((n,r)=>n+product(s,r.product).liters*r.qty,0)
  return {used,held,pickup,free:place(s,id).capacity-used-held}
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)
export function source(s,p,target){
  const dest=place(s,target)
  return s.places.filter(q=>freeStock(s,p,q.id)>0).sort((a,b)=>rank(a)-rank(b))[0]
  function rank(q){return q.id===target?0:q.id==='hub'?100:q.city===dest.city?1+distance(q,dest):200+distance(q,dest)}
}
function request(s,p,qty,from,to,order=null){
  const trunk=from==='hub'||place(s,from).city!==place(s,to).city
  const r={id:s.next++,product:p.id,qty,from,to,order,purpose:order?'pickup':'storage',created:s.day,status:'Новая',kind:trunk?'Магистраль':'Робот',target:null,tried:[],departed:false}
  s.requests.push(r);return r
}
function volume(s,rows){return rows.reduce((a,r)=>a+product(s,r.product).liters*r.qty,0)}
function suggest(s,rows,id){
  const city=place(s,rows[0].to).city
  const fits=p=>p&&p.id!=='hub'&&p.city===city&&space(s,p.id).free+1e-8>=volume(s,rows.filter(r=>r.purpose!=='pickup'))&&rows.every(r=>!r.tried.includes(p.id)&&r.from!==p.id)
  const dest=id?place(s,id):s.places.find(fits)
  if(id)check(fits(dest),'У пункта недостаточно места, другой город или он уже отклонил партию')
  for(const r of rows){r.target=dest?.id||null;r.status=dest?'Согласование':'Ожидает места';r.batch=rows[0].id}
}
function arrive(s,r){
  const p=product(s,r.product)
  if(!r.departed)p.stock[r.from]-=r.qty
  p.stock[r.target]=(p.stock[r.target]||0)+r.qty
  r.status='Доставлено'
  const o=s.orders.find(o=>o.id===r.order)
  if(o){o.pickup=r.purpose==='pickup';o.loc=r.target;o.status=o.loc===o.to?'Готов к выдаче':'Предложение';o.cost+=(r.cost||0)}
  else if(r.target!==r.to)request(s,p,r.qty,r.target,r.to)
}
export function packingLiters(dims){
 check(Array.isArray(dims)&&dims.length===3,'Введите три размера упаковки')
 return dims.map(v=>number(v,.01,1000)).reduce((v,n)=>v*n,1)/1000
}
export function apply(s,a,now=Date.now()){
 const p=product(s,a.product),q=place(s,a.place),to=place(s,a.to)
 const o=s.orders.find(o=>o.id===Number(a.order))
 const rows=s.requests.filter(r=>Array.isArray(a.ids)&&a.ids.includes(r.id))
 switch(a.type){
 case 'product': {
   check(q&&categories.includes(a.category)&&typeof a.name==='string'&&a.name.trim().length>0&&a.name.length<=80,'Проверьте карточку товара')
   const liters=packingLiters(a.dims),qty=number(a.qty,1,10000,true)
   check(space(s,q.id).free>=liters*qty,'Недостаточно места')
   check(Array.isArray(a.dims)&&a.dims.length===3,'Введите габариты')
   s.products.push({id:s.next++,name:a.name.trim(),category:a.category,price:number(a.price,.01,1e7),liters,dims:a.dims.map(v=>number(v,.01,1000)),stock:{[q.id]:qty},icon:'📦',day:s.day});break
 }
 case 'capacity':check(q&&q.id!=='hub','Выберите ПВЗ');{const v=number(a.value,0,1e6);check(v>=q.capacity-space(s,q.id).free,'Объём занят товаром или обещан входящей партии');q.capacity=v}break
 case 'transfer':{
   check(q&&to&&to.id!=='hub'&&p&&q.id!==to.id,'Проверьте пункты отправки и назначения')
   const qty=number(a.qty,1,10000,true);check(freeStock(s,p,q.id)>=qty,'Недостаточно свободного товара')
   request(s,p,qty,q.id,to.id);break
 }
 case 'order':{
   check(p&&to&&to.id!=='hub','Выберите товар и пункт выдачи');const src=source(s,p,to.id);check(src,'Товар закончился')
   const order={id:s.next++,product:p.id,loc:src.id,to:to.id,status:'Предложение',cost:0,created:s.day}
   s.orders.push(order)
   if(src.id===to.id)order.status='Готов к выдаче'
   else if(src.id==='hub'||src.city!==to.city){order.status='Доставка';request(s,p,1,src.id,to.id,order.id)}
   break
 }
 case 'choice':check(o?.status==='Предложение','Предложение уже обработано');if(a.accept===true)o.status='Готов к выдаче';else{o.status='Доставка';request(s,product(s,o.product),1,o.loc,o.to,o.id)}break
 case 'viaHub':check(rows.length&&rows.every(r=>r.kind==='Робот'&&r.status==='Новая'),'Выберите новые городские заявки');for(const r of rows)r.kind='Магистраль';break
 case 'offer':case 'trip':{
   check(rows.length,'Выберите заявки')
   for(const r of rows){
     const purpose=a.purpose==='auto'||!a.purpose?(r.order?'pickup':'storage'):a.purpose
     check(['storage','pickup'].includes(purpose)&&!(purpose==='pickup'&&!r.order),'Для выдачи требуется заказ покупателя')
     r.purpose=purpose
   }
   if(a.type==='trip')return prepareTrip(s,a,rows)
   check(rows.length&&rows.every(r=>r.kind==='Магистраль'&&['Новая','Ожидает места'].includes(r.status)&&place(s,r.to).city===place(s,rows[0].to).city),'Выберите новые заявки в один город');for(const r of rows)if(r.status==='Ожидает места')r.tried=[];suggest(s,rows,a.place);break
 }
 case 'reply':{
   const group=s.requests.filter(r=>r.batch===Number(a.batch)&&r.status==='Согласование'&&r.target===a.place)
   check(group.length,'Заявка уже обработана')
   if(a.accept===true){for(const r of group){r.cost=80*r.qty;r.status='Погрузка'}}
   else{for(const r of group){r.tried.push(r.target);r.target=null;r.status='Новая'}suggest(s,group)}
   break
 }
 case 'ship':case 'receive':case 'failure':{
   const r=s.requests.find(r=>r.id===Number(a.request))
   const t=a.type==='failure'?s.trips.find(t=>t.id===Number(a.trip)):s.trips.find(t=>t.ids.includes(r?.id)&&!['Сбой','Завершён'].includes(t.status))
   const items=t?s.requests.filter(r=>t.ids.includes(r.id)):[r]
   if(a.type==='failure'){
     check(t&&['Погрузка','В пути','Разгрузка'].includes(t.status),'Рейс уже закрыт')
     const moving=items.filter(i=>i.departed&&i.status!=='Доставлено')
     const held=moving.filter(i=>!s.orders.find(o=>o.id===i.order)?.pickup)
     check(space(s,t.route[0]).free>=volume(s,held),'Освободите место для возврата')
     for(const i of items.filter(i=>i.status!=='Доставлено')){
       if(i.departed)product(s,i.product).stock[i.from]+=i.qty
       const ord=s.orders.find(o=>o.id===i.order);if(ord)ord.status='Доставка'
       Object.assign(i,{departed:false,status:'Новая',target:null,sentAt:null,eta:null})
     }
     t.status='Сбой';break
   }
   check(r,'Заявка не найдена')
   if(a.type==='ship'){
     check(r.from===a.place&&items.every(i=>i.status==='Погрузка'),'Отправку подтверждает пункт отправления после согласования')
     for(const i of items){
       product(s,i.product).stock[i.from]-=i.qty
       const ord=s.orders.find(o=>o.id===i.order);if(ord)ord.status='В пути'
       const seconds=t?10*Math.max(1,t.route.indexOf(i.target)):25
       Object.assign(i,{departed:true,status:'В пути',sentAt:now,eta:now+seconds*1000})
     }
     if(t)t.status='В пути'
   }else{
     check(r.target===a.place&&['В пути','Разгрузка'].includes(r.status)&&now>=(r.eta||0),'Приёмка доступна в пункте назначения после прибытия')
     arrive(s,r);r.receivedAt=now
     if(t&&items.every(i=>i.status==='Доставлено'))t.status='Завершён'
   }
   break
 }
 case 'issue':{
   check(o?.status==='Готов к выдаче'&&o.loc===a.place,'Заказ не готов в этом ПВЗ');const item=product(s,o.product)
   item.stock[o.loc]--;o.status='Выдан'
   const storage=(s.day-item.day)*item.liters*.5,payout=22+storage
   s.ledger.push({order:o.id,loc:o.loc,price:item.price,storage,payout,transport:o.cost,pvz:payout-12,seller:item.price*.3-payout-o.cost,saving:80-payout-o.cost});break
 }
 case 'return':check(o?.status==='Выдан'&&o.loc===a.place,'Возврат уже учтён или выбран другой ПВЗ');check(space(s,o.loc).free>=product(s,o.product).liters,'Нет места для возврата');product(s,o.product).stock[o.loc]++;o.status='Возвращён';{const l=s.ledger.find(l=>l.order===o.id);l.seller-=l.price*.3+15;l.saving-=15}break
 case 'day':s.day++;break
 default:throw Error('Неизвестная операция')
 }
}

function prepareTrip(s,a,rows){
   check(rows.length&&rows.every(r=>r.kind==='Робот'&&r.status==='Новая'&&r.from===rows[0].from),'Выберите новые заявки из одного ПВЗ')
   const qty=rows.reduce((n,r)=>n+r.qty,0)
   check(qty >= rover.minUnits, 'Для рейса нужно не менее '+rover.minUnits+' упаковок')
   check(volume(s,rows) <= rover.liters + 1e-8, 'Общий объём груза превышает '+rover.liters+' л')
   // ponytail: individual fit and total volume are checked; mixed-box packing needs a 3D solver.
   for (const row of rows) {
     const item = product(s,row.product)
     check([...item.dims].sort((a,b)=>a-b).every((size,index)=>size<=sortedCargoDimensions[index]),
       'Упаковка не помещается в багажник: '+item.name)
   }
   check(['R-01','R-02'].includes(a.robot)&&!s.trips.some(t=>t.robot===a.robot&&!['Сбой','Завершён'].includes(t.status)),'Робот занят')
   const stops=[...new Set(rows.map(r=>r.to))],route=[rows[0].from]
   for(const id of stops)check(space(s,id).free>=volume(s,rows.filter(r=>r.to===id&&r.purpose!=='pickup')),'Нет места в пункте назначения')
   while(stops.length){const here=place(s,route.at(-1));stops.sort((a,b)=>distance(here,place(s,a))-distance(here,place(s,b)));route.push(stops.shift())}
   const trip={id:s.next++,robot:a.robot,status:stages[0],route,ids:rows.map(r=>r.id)};s.trips.push(trip)
   for(const r of rows){r.status=trip.status;r.target=r.to;r.cost=360*r.qty/qty}
}
