const {envId} = require('./config');

App({
  globalData: { envId },
  onLaunch() {
    if (envId && wx.cloud) wx.cloud.init({env: envId});
  }
});
