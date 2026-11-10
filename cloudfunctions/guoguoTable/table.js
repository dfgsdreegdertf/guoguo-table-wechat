const {createHash, timingSafeEqual} = require('node:crypto');

const COLLECTION = 'guoguo_table';
const roleNames = ['owner', 'guest'];
const requestIdPattern = /^[a-z0-9-]{12,48}$/;
const portionOptions = {
  coriander: ['不放香菜', '少放香菜', '正常放香菜'],
  spice: ['不辣', '微辣', '中辣', '很辣'],
  sugar: ['无糖', '三分糖', '半糖', '正常糖'],
  ice: ['去冰', '少冰', '正常冰', '热饮']
};
const success = data => ({ok: true, ...data});
const failure = (message, code = 'INVALID') => ({ok: false, message, code});
const input = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const openidKey = role => role + 'Openid';
const hashKey = role => role + 'Hash';
const digest = text => createHash('sha256').update(text).digest();

function getRole(pair, openid) {
  return roleNames.find(role => pair[openidKey(role)] === openid) || '';
}

function verifyInvite(hash, code) {
  return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(hash, 'hex'), digest(code));
}

async function readDocument(ref) {
  try {
    const {data} = await ref.get();
    return (Array.isArray(data) ? data[0] : data) || null;
  } catch (err) {
    if (err.errCode === -502005 || /document .*(?:not exist|not found)|document does not exist/i.test(err.errMsg || err.message || '')) {
      return null;
    }
    throw err;
  }
}

function createHandler(db, catalog, groups) {
  const collection = db.collection(COLLECTION);
  const stock = new Map(catalog.map(dish => [dish.id, dish]));
  const findDish = (pair, id) => stock.get(id) || pair.dishes.find(dish => dish.id === id);
  async function transact(action) {
    const result = await db.runTransaction(action);
    return result.result === undefined ? result : result.result;
  }
  async function loadState(pair, role) {
    const latest = kind => collection.where({kind}).orderBy('created', 'desc').limit(40).get();
    const [orders, tasks] = await Promise.all([latest('order'), latest('task')]);
    return success({role, dishes: pair.dishes, hidden: pair.hidden, orders: orders.data, tasks: tasks.data});
  }
  function join(event, identity) {
    const code = input(event.code, 80).toLowerCase();
    if (!/^[0-9a-f]{24}$/.test(code)) return failure('请输入完整的 24 位绑定码');
    return transact(async tx => {
      const ref = tx.collection(COLLECTION).doc('pair');
      const pair = await readDocument(ref);
      if (!pair || pair.appid !== identity.appid) return failure('小餐桌尚未配置', 'SETUP');
      const existing = getRole(pair, identity.openid);
      if (existing) return success({role: existing});
      const role = roleNames.find(item => !pair[openidKey(item)] && verifyInvite(pair[hashKey(item)], code));
      if (!role) return failure('绑定码无效或已经使用');
      await ref.update({data: {[openidKey(role)]: identity.openid, [hashKey(role)]: ''}});
      return success({role});
    });
  }
  function updateMenu(event, identity) {
    return transact(async tx => {
      const ref = tx.collection(COLLECTION).doc('pair');
      const pair = await readDocument(ref);
      if (!pair || pair.appid !== identity.appid || getRole(pair, identity.openid) !== 'owner') {
        return failure('只有主厨可以管理菜单', 'FORBIDDEN');
      }
      if (event.action === 'visibility') {
        if (typeof event.hidden !== 'boolean' || !findDish(pair, event.id)) return failure('没有找到这道菜');
        const hidden = new Set(pair.hidden);
        if (event.hidden) hidden.add(event.id);
        else hidden.delete(event.id);
        await ref.update({data: {hidden: [...hidden]}});
        return success({});
      }

      const name = input(event.name, 40);
      const group = event.group;
      const image = input(event.image, 500);
      if (!name || typeof group !== 'string' || !Object.hasOwn(groups, group)) return failure('请填写菜名并选择分类');
      if (image) {
        try {
          if (new URL(image).protocol !== 'https:') return failure('配图链接要以 https:// 开头');
        } catch {
          return failure('请检查配图链接');
        }
      }
      const id = 'custom-' + event.requestId;
      if (findDish(pair, id)) return success({id});
      if (pair.dishes.length >= 150) return failure('已达到自定义菜品数量上限');
      const dish = {
        id, name, group, image, description: input(event.description, 90), sweet: event.sweet === true,
        badge: '', spice: '不辣'
      };
      await ref.update({data: {dishes: [...pair.dishes, dish]}});
      return success({id});
    });
  }
  function createEntry(event, identity) {
    const kind = event.action;
    const id = kind + '-' + event.requestId;
    return transact(async tx => {
      const table = tx.collection(COLLECTION);
      const pair = await readDocument(table.doc('pair'));
      const role = pair && pair.appid === identity.appid && getRole(pair, identity.openid);
      if (!role) return failure('请先绑定微信', 'INVITE_REQUIRED');
      const ref = table.doc(id);
      if (await readDocument(ref)) return success({id});
      const record = {kind, created: Date.now(), done: false, by: role};
      if (kind === 'task') {
        record.title = input(event.title, 100);
        if (!record.title) return failure('请写下要派发的任务');
      } else {
        const date = input(event.date, 10);
        const time = input(event.time, 5);
        const due = new Date(date + 'T' + time + ':00+08:00');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
            !Number.isFinite(due.getTime()) || due.getTime() <= Date.now() ||
            new Date(due.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== date) {
          return failure('请选择晚于现在的开饭时间');
        }
        if (!Array.isArray(event.items) || event.items.length === 0 || event.items.length > 30) {
          return failure('请在餐盘中选择 1 到 30 种餐品');
        }
        record.date = date;
        record.time = time;
        record.note = input(event.note, 300);
        record.items = [];
        for (const item of event.items) {
          if (!item || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20) return failure('请检查份数');
          const dish = findDish(pair, item.id);
          if (!dish || pair.hidden.includes(item.id)) return failure('有餐品已下架，请刷新菜单', 'MENU_CHANGED');
          const taste = groups[dish.group].taste;
          const keys = taste === 'drink' ? ['sugar', 'ice'] : taste === 'food' ? ['coriander', 'spice'] : [];
          const options = keys.map(key => portionOptions[key].includes(item[key]) ? item[key] : portionOptions[key][0]);
          record.items.push({id: dish.id, name: dish.name, qty: item.qty, options: options.join(' · ')});
        }
      }
      await ref.set({data: record});
      return success({id});
    });
  }

  return async function handle(event, identity) {
    if (!identity.openid || !identity.appid) return failure('请在微信小程序内打开', 'FORBIDDEN');
    try {
      const pair = await readDocument(collection.doc('pair'));
      if (!pair || pair.appid !== identity.appid) return failure('小餐桌尚未配置', 'SETUP');
      const role = getRole(pair, identity.openid);
      if (event.action === 'join') return await join(event, identity);
      if (!role) return failure('请先绑定微信', 'INVITE_REQUIRED');
      if (event.action === 'state') return await loadState(pair, role);
      if (event.action === 'status') {
        if (role !== 'owner') return failure('只有主厨可以更新进度', 'FORBIDDEN');
        if (typeof event.id !== 'string' || !/^(task|order)-[a-z0-9-]{12,48}$/.test(event.id) ||
            typeof event.done !== 'boolean') return failure('记录格式有误');
        const result = await collection.doc(event.id).update({data: {done: event.done}});
        return result.stats.updated ? success({}) : failure('没有找到这条记录');
      }
      if (event.action === 'visibility') return await updateMenu(event, identity);
      if (typeof event.requestId !== 'string' || !requestIdPattern.test(event.requestId)) return failure('请求格式有误');
      if (event.action === 'addDish') return await updateMenu(event, identity);
      if (event.action === 'order' || event.action === 'task') return await createEntry(event, identity);
      return failure('不支持这项操作');
    } catch (err) {
      console.error('guoguo-table:', err.errCode || err.code || err.name);
      return failure('暂时连不上小餐桌，请稍后重试', 'UNAVAILABLE');
    }
  };
}

module.exports = {createHandler};
