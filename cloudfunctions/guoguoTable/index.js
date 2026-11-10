const cloud = require('wx-server-sdk');
const {createHandler} = require('./table');
const {catalog, groups} = require('./menu.json');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const handle = createHandler(cloud.database(), catalog, groups);

exports.main = async event => {
  const {APPID, OPENID, SOURCE} = cloud.getWXContext();
  if (SOURCE !== 'wx_client') return {ok: false, code: 'FORBIDDEN', message: '请在微信小程序内打开'};
  return handle(event, {appid: APPID, openid: OPENID});
};
