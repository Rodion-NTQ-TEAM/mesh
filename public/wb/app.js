import {routeMap} from '/route-map.js'
import {place,space,product,rover} from '/model.mjs'

import {root, state, start, post, notify, loc, esc, name, num, field, opts, offices, submit, hero, deliveries, panel, none, tag, button, rub, reqRow} from '/app.js'

const selected=new Set()

function wb(){
 const queue=state.requests.filter(r=>['Новая','Ожидает места'].includes(r.status))
 const groups=Object.groupBy(queue,r=>r.kind==='Робот'?'robot-'+r.from:'hub-'+place(state,r.to).city)
 const freed=id=>!state.trips.some(t=>t.robot===id&&!['Завершён','Сбой'].includes(t.status))
 const forms=Object.entries(groups).map(([key,list])=>{
 const isHub=key.startsWith('hub-'),city=place(state,list[0].to).city
 return `<form class="entry" data-form="${isHub?'offer':'trip'}"><h3>${isHub?'Поставка в '+city:'Рейс из '+loc(list[0].from)}</h3>${list.map(r=>`<label class="check"><input name="ids" type="checkbox" value="${r.id}" ${selected.has(r.id)?'checked':''}>№${r.id} · ${esc(product(state,r.product).name)} × ${r.qty} → ${name(r.to)} · ${r.order?'заказ №'+r.order:'сток продавца'} · ${num(r.qty*product(state,r.product).liters)} л</label>`).join('')}<div class="form">${field('purpose','Назначение',opts([['auto','По заявкам'],['storage','На хранение'],['pickup','На выдачу по заказу']]))}${isHub?field('place','Пункт приёмки',opts([['','Подобрать по вместимости'],...offices().filter(q=>q.city===city).map(q=>[q.id,q.name+' · свободно '+num(space(state,q.id).free)+' л'])])):field('robot','Свободный робот',opts(['R-01','R-02'].filter(freed).map(t=>[t,t])))}${submit(isHub?'Запросить приёмку':'Построить маршрут и начать погрузку')}${isHub?'':'<button name="fallback">Отправить через хаб</button>'}</div><p class="muted tiny" data-quote></p></form>`
 }).join('')
 return hero('Диспетчерская WB','Сгруппируйте заявки одного города или соберите рейс робота.')+
 routeMap(state)+deliveries('hub')+panel('Очередь заявок',forms||none('Новых заявок нет. Создайте перемещение в кабинете продавца или оформите заказ.'))+
 panel('Рейсы роботов', `<p class="muted">Багажник ${rover.dimensions.join(' × ')} см · ${num(rover.liters)} л · от ${rover.minUnits} упаковок · рекомендуемая загрузка ${rover.idealMin}–${rover.idealMax}</p>`+ (state.trips.slice().reverse().map(t=>`<div class="entry"><div class="row"><b>${t.robot} · рейс №${t.id}</b>${tag(t.status)}</div><p>${t.route.map(name).join(' → ')}</p>${['Погрузка','В пути','Разгрузка'].includes(t.status)?`<div class="actions"><small>Отправку подтверждает исходный ПВЗ, получение — каждый принимающий пункт.</small>${button('Сбой и возврат на базу','failure',{trip:t.id})}</div>`:''}</div>`).join('')||none('Активных рейсов нет')))+
 panel('Экономика WB',state.ledger.map(l=>`<div class="entry">№${l.order} · базовый хаб 80 ₽ · выплаты ПВЗ ${rub(l.payout)} · перевозка ${rub(l.transport)} · эффект <b>${rub(l.saving)}</b></div>`).join('')||none('Сравнение с хабом появится после выдачи'))+
 panel('Все заявки',state.requests.slice().reverse().map(reqRow).join('')||none('История пуста'))+
 `<details class="panel"><summary>Управление демонстрацией</summary><p>День ${state.day}. Перевод времени добавляет день хранения и ожидания.</p><div class="actions">${button('Следующий день','day')}${button('Восстановить демоданные','reset')}</div></details>`
}

root.onchange=e=>{const el=e.target;if(el.name==='ids'){if(el.checked)selected.add(+el.value);else selected.delete(+el.value);const rows=state.requests.filter(r=>[...el.form.querySelectorAll('input:checked')].some(i=>+i.value===r.id));const units=rows.reduce((n,r)=>n+r.qty,0);const quote=el.form.querySelector('[data-quote]');if(quote)quote.textContent=units?'Выбрано '+units+' шт. · '+num(rows.reduce((n,r)=>n+r.qty*product(state,r.product).liters,0))+' л'+(el.form.dataset.form==='trip'?' из '+num(rover.liters)+' л'+(units<rover.minUnits?' · недостаточно упаковок':units<rover.idealMin?' · ниже рекомендуемой загрузки':units>rover.idealMax?' · выше рекомендуемой загрузки':' · рекомендуемая загрузка')+' · рейс '+rub(360/units)+'/шт. · хаб 80 ₽/шт.':''):'';return}}

root.onclick=e=>{
 if(e.target.closest('button[data-action="reset"]')&&!confirm('Заменить текущие заказы и остатки демонстрационными данными?'))e.preventDefault()
}
root.onsubmit=e=>{
 e.preventDefault()
 const form=e.target, data=new FormData(form), ids=data.getAll('ids').map(Number)
 if(!ids.length){notify('Отметьте заявки для отправки');return}
 post({...Object.fromEntries(data),ids,type:e.submitter?.name==='fallback'?'viaHub':form.dataset.form})
}

start(wb, () => selected.clear())
