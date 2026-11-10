# 果果的小餐桌

一个给两个人用的微信小程序。果果可以点餐、选口味、约开饭时间和派任务。主厨可以查看订单、处理任务、添加餐品，以及下架或恢复菜单里的餐品。

菜单预置 133 项餐品和配图，包含八大菜系及豫菜、米饭、面食、麻辣烫、果茶、奶茶和冰淇淋等。点餐可按餐品选择香菜、辣度、糖度或冰量。

## 从零部署

### 1. 准备小程序和云环境

安装 Node.js 18 或更高版本和微信开发者工具。在微信公众平台注册个人小程序，用管理员微信登录。在小程序后台查看 AppID，然后在「开发与服务 → 云服务 → 云开发」开通云开发，创建一个使用**文档型数据库**的环境。记录完整的环境 ID。[微信公众平台](https://mp.weixin.qq.com/) · [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) · [云开发环境说明](https://docs.cloudbase.net/quick-start/create-env)

### 2. 生成本地配置和双人绑定码

克隆或解压本项目，在包含 `project.config.example.json` 的目录运行下面的命令。Windows 也可双击「配置小程序.cmd」。

```sh
node scripts/setup.mjs
```

按提示输入 AppID 和环境 ID。脚本会生成 `project.config.json`、`miniprogram/config.js` 和 `bootstrap.private.json`，并在终端显示主厨和果果各自的**一次性绑定码**。把两串码分别存好。生成文件和绑定码都留在本地。

### 3. 初始化数据库并部署云函数

1. 在刚才的云环境里打开 **文档型数据库 → 集合管理**。新建集合 `guoguo_table`，权限选 **「仅管理端可读写」**。网页控制台有时将这一项显示为 **「无权限 [ADMINONLY]」**。[腾讯云数据库权限说明](https://docs.cloudbase.net/recipes/add-database-wechat-miniprogram)
2. 在 `guoguo_table` 里导入项目根目录的 `bootstrap.private.json`。确认成功导入一条 `_id` 为 `pair` 的记录。这条记录保存两人的绑定状态，初始化文件只导入一次。[腾讯云导入说明](https://docs.cloudbase.net/database/manage)
3. 用微信开发者工具导入包含 `project.config.json` 的项目目录。确认左侧 `cloudfunctions` 的当前环境是刚建好的环境。
4. 展开 `cloudfunctions`，右键 `guoguoTable`，选 **「上传并部署：云端安装依赖」**。如果菜单显示 **「创建并部署：云端安装依赖」**，首次部署选这一项。云函数运行环境选 Node.js 18 或更高版本，使用小程序直接调用的方式。[腾讯云云函数部署说明](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)

### 4. 真机预览并开放双人体验版

1. 等部署成功，点开发者工具顶部 **「预览」**。用主厨自己的手机微信扫码，输入主厨绑定码。菜单出现后，即可继续上传。电脑模拟器显示「请在微信小程序内打开」时，用真机预览验证。
2. 在开发者工具顶部点 **「上传」**，填写版本号，例如 `1.0.0`。到小程序后台 **管理 → 版本管理**，将这条开发版本设为 **体验版**。
3. 在 **管理 → 成员管理 → 体验成员** 里添加果果使用的微信号。需要扫码确认时，用注册小程序的管理员微信确认。
4. 从 **版本管理** 里的体验版条目获取二维码，把体验版二维码和果果的绑定码单独发给她。她用刚才加入体验成员的微信扫码，在小餐桌里输入果果绑定码。[腾讯体验版说明](https://free-plat-test.qcloudcdn.com/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Mini-Program)

## 怎么用

- **果果**在菜单里选菜、填口味和开饭时间，然后提交订单。也可以在任务页给主厨派任务。
- **主厨**打开「厨房」查看订单和任务，点「刷新」同步最新记录，完成后更新状态。可以在厨房管理菜单、添加餐品、下架或恢复餐品。
- 首次使用时，果果可以先下一份测试单并派一条任务。主厨看到相同的订单和任务，再标记完成，果果重新打开页面即可核对状态。

## 项目文件

| 路径 | 用途 |
| --- | --- |
| `miniprogram/` | 微信页面、菜单及图片 |
| `cloudfunctions/guoguoTable/` | 微信身份校验、双人绑定、订单、任务和菜单管理 |
| `scripts/setup.mjs` | 生成本地配置、初始化记录和一次性绑定码 |
| `project.config.example.json` | 微信开发者工具的配置模板 |

订单、任务和自定义菜单存放在部署者自己的云开发环境里。照片的原始网页见[配图来源](配图来源.md)。
