const {departments, groups, catalog} = require('../../menu');
const {envId} = require('../../config');
const options = {
  coriander: ['不放香菜', '少放香菜', '正常放香菜'],
  spice: ['不辣', '微辣', '中辣', '很辣'],
  sugar: ['无糖', '三分糖', '半糖', '正常糖'],
  ice: ['去冰', '少冰', '正常冰', '热饮']
};
const groupChoices = departments.flatMap(section =>
  section.groups.map(([id, name]) => ({id, label: section.label + ' / ' + name}))
);
const choose = e => e.currentTarget.dataset.id;
const notify = title => wx.showToast({title, icon: 'none'});
const shanghaiTime = date => new Date(date + 8 * 3600000).toISOString();
const blankDish = () => ({name: '', group: '', image: '', description: '', sweet: false});
const draftKey = 'guoguo-draft';
const favoritesKey = 'guoguo-favorites';
const manageStates = ['在售', '已下架', '全部'];
const fallback = {
  rice:'🍚', noodle:'🍜', 'rice-noodle':'🍜', bun:'🥟', porridge:'🥣',
  mala:'🥘', drink:'🥤', dessert:'🍨', food:'🍽️'
};

async function call(action, data = {}) {
  const {result} = await wx.cloud.callFunction({name: 'guoguoTable', data: {action, ...data}});
  if (!result || !result.ok) {
    const error = new Error(result && result.message || '暂时连不上小餐桌');
    error.code = result && result.code;
    throw error;
  }
  return result;
}
function readStorage(key) {
  const data = wx.getStorageSync(key);
  return Array.isArray(data) ? data : [];
}
function presentOrder(order) {
  return {...order, dateTime: order.date + ' ' + order.time, status: order.done ? '已完成' : '待开饭'};
}

Page({
  data: {
    ready: false, busy: false, role: '', setup: false, error: '', invite: '',
    tab: 'menu', departments, section: 'staple', group: '', filters: [], visible: [],
    showSweet: false, showFavorites: false, favorites: [], photoErrors: {},
    cart: [], portions: 0, date: '', time: '', today: '', note: '', options,
    taskText: '', tasks: [], orders: [],
    groupLabels: groupChoices.map(item => item.label), groupLabel: '', newDish: blankDish(),
    manageStates, manageState: 0, manageSearch: '', managed: []
  },
  onLoad() {
    this.stock = catalog;
    this.available = [];
    this.hidden = new Set();
    this.requestIds = {};
    const today = shanghaiTime(Date.now());
    const later = shanghaiTime(Date.now() + 3600000);
    this.setData({
      today: today.slice(0, 10),
      date: later.slice(0, 10), time: later.slice(11, 16),
      cart: readStorage(draftKey), favorites: readStorage(favoritesKey)
    });
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    if (!this.loading) {
      this.loading = this.fetchState().finally(() => { this.loading = null; });
    }
    return this.loading;
  },
  async fetchState() {
    if (!envId || !wx.cloud) {
      this.setData({ready: true, setup: true, error: '小餐桌正在等管理员完成配置'});
      return;
    }
    try {
      const result = await call('state');
      this.stock = [...catalog, ...result.dishes];
      this.hidden = new Set(result.hidden);
      this.available = this.stock.filter(dish => !this.hidden.has(dish.id));
      this.setData({
        role: result.role, ready: true, error: '', setup: false,
        orders: result.orders.map(presentOrder), tasks: result.tasks
      });
      this.updateCart(this.data.cart.filter(item => this.available.some(dish => dish.id === item.id)));
      this.filterMenu();
      if (result.role === 'owner') this.filterManagement();
    } catch (err) {
      const clear = ['INVITE_REQUIRED', 'FORBIDDEN', 'SETUP'].includes(err.code);
      const setup = err.code === 'SETUP';
      if (!clear) {
        console.error('[小餐桌] 读取云端状态失败', err.errCode ?? err.code, err.errMsg || err.message);
      }
      this.setData({
        ready: true, setup, role: clear ? '' : this.data.role,
        error: err.code === 'INVITE_REQUIRED' ? '' : (err.message || '暂时连不上小餐桌')
      });
    }
  },
  handleInput(e) {
    if (this.data.busy) return;
    this.setData({[e.currentTarget.dataset.field]: e.detail.value});
  },
  async join() {
    const code = this.data.invite.trim();
    if (!code || this.data.busy) return;
    this.setData({busy: true});
    try {
      await call('join', {code});
      this.setData({invite: ''});
      await this.loading;
      await this.refresh();
    } catch (err) {
      notify(err.message || '绑定失败');
    } finally {
      this.setData({busy: false});
    }
  },
  tab(e) {
    const tab = choose(e);
    if (tab !== 'kitchen' || this.data.role === 'owner') this.setData({tab});
    if (tab === 'kitchen' || tab === 'tasks') this.refresh();
  },
  section(e) {
    this.setData({section: choose(e), group: '', showSweet: false, showFavorites: false});
    this.filterMenu();
  },
  selectGroup(e) {
    this.setData({group: choose(e), showSweet: false, showFavorites: false});
    this.filterMenu();
  },
  quick(e) {
    const sweet = choose(e) === 'sweet';
    this.setData({
      showSweet: sweet && !this.data.showSweet,
      showFavorites: !sweet && !this.data.showFavorites
    });
    this.filterMenu();
  },
  favorite(e) {
    const id = choose(e);
    const favorites = new Set(this.data.favorites);
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    const saved = [...favorites];
    wx.setStorageSync(favoritesKey, saved);
    this.setData({favorites: saved});
    this.filterMenu();
  },
  tile(dish) {
    const category = groups[dish.group];
    return {
      ...dish,
      groupLabel: category.label, department: category.department,
      icon: fallback[dish.group] || fallback[category.taste],
      saved: this.data.favorites.includes(dish.id)
    };
  },
  filterMenu() {
    const {section, group, showSweet, showFavorites} = this.data;
    const department = departments.find(item => item.id === section);
    const filters = [{id: '', label: '全部'}, ...department.groups.map(([id, label, preferred]) => ({id, label, preferred}))];
    const visible = this.available.map(item => this.tile(item)).filter(item => {
      if (showSweet) return item.sweet;
      if (showFavorites) return item.saved;
      return item.department === section && (!group || item.group === group);
    });
    this.setData({filters, visible});
  },
  photoFailed(e) {
    this.setData({['photoErrors.' + choose(e)]: true});
  },
  updateCart(items) {
    wx.setStorageSync(draftKey, items);
    const portions = items.reduce((sum, item) => sum + item.qty, 0);
    this.setData({cart: items, portions});
  },
  changeQty(e) {
    if (this.data.busy) return;
    const id = choose(e);
    const increment = Number(e.currentTarget.dataset.qty);
    const cart = this.data.cart.slice();
    const position = cart.findIndex(item => item.id === id);
    if (position !== -1) {
      const item = {...cart[position], qty: cart[position].qty + increment};
      if (item.qty > 20) return notify('每样餐品最多 20 份');
      if (item.qty > 0) cart[position] = item;
      else cart.splice(position, 1);
    } else if (increment > 0) {
      const dish = this.available.find(item => item.id === id);
      if (!dish) return;
      if (cart.length >= 30) return notify('最多选 30 种餐品');
      const taste = groups[dish.group].taste;
      const item = {id, name: dish.name, qty: 1, taste};
      if (taste === 'food') {
        item.coriander = '不放香菜';
        item.spice = dish.spice || '不辣';
      } else if (taste === 'drink') {
        item.sugar = '半糖';
        item.ice = '正常冰';
      }
      cart.push(item);
    }
    this.updateCart(cart);
  },
  changeOption(e) {
    if (this.data.busy) return;
    const {id, key} = e.currentTarget.dataset;
    this.updateCart(this.data.cart.map(item =>
      item.id === id ? {...item, [key]: options[key][e.detail.value]} : item
    ));
  },
  async save(action, data, finished) {
    if (this.data.busy) return;
    this.setData({busy: true});
    const fingerprint = JSON.stringify(data);
    const pending = this.requestIds[action];
    if (!pending || pending.fingerprint !== fingerprint) {
      const nonce = Math.random().toString(36).slice(2).padEnd(10, '0');
      this.requestIds[action] = {fingerprint, id: Date.now().toString(36) + '-' + nonce};
    }
    try {
      await call(action, {...data, requestId: this.requestIds[action].id});
      delete this.requestIds[action];
      if (finished) finished();
      await this.loading;
      await this.refresh();
    } catch (err) {
      notify(err.message || '操作失败');
      if (err.code === 'MENU_CHANGED') await this.refresh();
    } finally {
      this.setData({busy: false});
    }
  },
  order() {
    const {cart, date, time, note} = this.data;
    if (!cart.length) return notify('餐盘还空着');
    this.save('order', {items: cart, date, time, note}, () => {
      this.updateCart([]);
      this.setData({note: ''});
      notify('点餐已送到厨房 ♡');
    });
  },
  sendTask() {
    const title = this.data.taskText.trim();
    if (!title) return notify('请先写下要派发的任务');
    this.save('task', {title}, () => {
      this.setData({taskText: ''});
      notify('任务已送到厨房 ♡');
    });
  },
  status(e) {
    this.save('status', {id: choose(e), done: e.currentTarget.dataset.done === 'yes'});
  },
  chooseDishGroup(e) {
    const {id, label} = groupChoices[Number(e.detail.value)];
    this.setData({'newDish.group': id, groupLabel: label});
  },
  sweetDish(e) {
    this.setData({'newDish.sweet': e.detail.value});
  },
  addDish() {
    this.save('addDish', this.data.newDish, () => {
      this.setData({newDish: blankDish(), groupLabel: ''});
      notify('已经加入菜单');
    });
  },
  manageState(e) {
    this.setData({manageState: Number(e.detail.value)});
    this.filterManagement();
  },
  searchManagement(e) {
    this.setData({manageSearch: e.detail.value});
    this.filterManagement();
  },
  filterManagement() {
    const {manageState, manageSearch} = this.data;
    const query = manageSearch.trim().toLowerCase();
    const managed = this.stock.map(item => ({...this.tile(item), hidden: this.hidden.has(item.id)}))
      .filter(item => (manageState === 2 || item.hidden === (manageState === 1)) &&
        (item.name + item.groupLabel).toLowerCase().includes(query));
    this.setData({managed});
  },
  visibility(e) {
    this.save('visibility', {id: choose(e), hidden: e.currentTarget.dataset.hidden === 'yes'});
  }
});
