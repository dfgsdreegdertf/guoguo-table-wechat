import {createHash, randomBytes} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';

const project = new URL('../project.config.json', import.meta.url);
const projectTemplate = new URL('../project.config.example.json', import.meta.url);
const config = new URL('../miniprogram/config.js', import.meta.url);
const bootstrap = new URL('../bootstrap.private.json', import.meta.url);

if (existsSync(bootstrap)) {
  console.error('已生成初始化文件。请保留现有绑定配置，避免覆盖已绑定的账号。');
  process.exitCode = 1;
} else {
  const prompt = createInterface({input: process.stdin, output: process.stdout});
  let appid;
  let envId;
  try {
    appid = (process.argv[2] || await prompt.question('小程序 AppID（wx 开头）：')).trim();
    envId = (process.argv[3] || await prompt.question('云开发环境 ID：')).trim();
  } finally {
    prompt.close();
  }
  if (!/^wx[0-9a-f]{16}$/i.test(appid) || !/^[a-z0-9-]{4,100}$/i.test(envId)) {
    console.error('请检查小程序 AppID 和云开发环境 ID。');
    process.exitCode = 1;
  } else {
    const owner = randomBytes(12).toString('hex');
    const guest = randomBytes(12).toString('hex');
    const hash = value => createHash('sha256').update(value).digest('hex');
    const pair = {
      _id: 'pair', kind: 'config', appid,
      ownerOpenid: '', guestOpenid: '', ownerHash: hash(owner), guestHash: hash(guest),
      dishes: [], hidden: []
    };
    const settings = JSON.parse(readFileSync(existsSync(project) ? project : projectTemplate, 'utf8'));
    writeFileSync(project, JSON.stringify({...settings, appid}, null, 2) + '\n');
    writeFileSync(config, 'module.exports = ' + JSON.stringify({envId}) + ';\n');
    writeFileSync(bootstrap, JSON.stringify(pair) + '\n', {flag: 'wx'});
    console.log('\n主厨绑定码（你自己用）：' + owner);
    console.log('果果绑定码（发给果果）：' + guest);
    console.log('\n把 bootstrap.private.json 导入云数据库集合 guoguo_table。');
    console.log('请分别保管两个绑定码。每个绑定码只能绑定一个微信。');
  }
}
