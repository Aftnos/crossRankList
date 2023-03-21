
/**
 * 插件名:跨服排行榜(websocket版本)
 * 作者:Yoyo
 * 版本:v0.1.2
 * 需要一个后端程序作为基础 先启动后端才能启动这个哦
 */


const CONFIG = new JsonConfigFile('./plugins/Yoyo/crossRankList/config.json', JSON.stringify({
    host: '',//根据后端程序的服务器和端口设置
    key: '',//请求密钥
    server: '',//当前服务器的别名 1-10个字符
    showType: 'sidebar',//显示类型  from表单  sidebar 侧边栏
    maxShowCount: 20,//排行榜最大显示数量
    switch: {
        destroyBlock: true,//挖掘开关
        dieRecord: true,//玩家死亡记录
        killmRecord: true,//击杀生物记录
        killRecord: true,//击杀玩家记录
        moneyRecord: true,//玩家llmoney记录
    }
}));

ll.registerPlugin('跨服排行榜<' + CONFIG.get('server') + '>', '用于对接后端的一个程序提交和数据展示的', [0, 1, 2], { author: 'Yoyo' });

const glData = {};//侧边栏刷新每局的缓存数据
const receiveType = {};//接收推送类型有那些
const wsc = new WSClient();

connect();//连接



wsc.listen("onTextReceived", (msg) => {
    let objData = toJson(msg);
    if (objData) {
        if (objData.type == 'push') {
            // 服务器推送信息
            let newDaraType = '';
            let newDara = objData.data;
            if (newDara.player) {
                glData[`pl_${newDara.player.type}`] = newDara.player.data;
                newDaraType = newDara.player.type;
            }
            if (newDara.server) {
                glData[`server_${newDara.server.type}`] = newDara.server.data;
                newDaraType = newDara.server.type;

            }
            // 通知玩家刷新侧边栏
            let plallList = mc.getOnlinePlayers();
            for (let pl of plallList) {
                refreshData(pl, newDaraType);
            }

        } else if (objData.type == 'reply') {
            // 服务器返回的信息 包含wsId
        } else if (objData.type == 'broadcast') {
            // 服务器返回广播信息
            let broadcastData = objData.data;
            if (broadcastData.btype == 'big') {
                let allPlayer = mc.getOnlinePlayers();
                allPlayer.forEach(pl => {
                    pl.sendToast(`§g(大喇叭)§e[${broadcastData.server}]`, `§d<${broadcastData.name}> §g${broadcastData.text}`);
                });
                mc.broadcast(`§l§g(大喇叭)§e[${broadcastData.server}]§d<${broadcastData.name}> §g${broadcastData.text}`);
                return;
            }

            if (broadcastData.btype == 'small') {
                mc.broadcast(`§l§g(小喇叭)§e[${broadcastData.server}]§d<${broadcastData.name}> §g${broadcastData.text}`);
                return;
            }
        }
    }
});

wsc.listen("onError", (msg) => {
    logger.error('发生错误!', msg);

});

wsc.listen("onLostConnection", (code) => {
    logger.error('连接断开 5 秒后尝试重新恢复连接,可能网络波动!');
    setTimeout(() => {
        connect();//连接
    }, 5000);

});


LLSE_Player.prototype.recdestroy = function () {
    let destroy = this.getExtraData('destroyInfo');
    if (!destroy) {
        destroy = { count: 1, Timeout: null };
    }
    if (destroy.Timeout) {
        // 记录连续挖掘的次数
        destroy.count++;
        clearInterval(destroy.Timeout);
        this.setExtraData('destroyInfo', destroy);
    }
    destroy.Timeout = setTimeout(() => {
        // 发起请求 记录挖掘次数上传
        sendJsons('updata', { digging: destroy.count }, this);
        destroy.Timeout = null;
        destroy.count = 1;
        this.setExtraData('destroyInfo', destroy);
    }, 1000);

}


LLSE_Player.prototype.modal = function ({ title = '提示', text = '你确定要这么操作?', btnArr = ['确定', '取消'], ok = () => { } } = options = {}) {
    this.sendModalForm(title, text, btnArr[0], btnArr[1] ?? '取消', ok);
}

LLSE_Player.prototype.startRtime = function () {
    this.setExtraData('onLine', Date.now());
}

LLSE_Player.prototype.endRtime = function () {
    let onLine = this.getExtraData('onLine');
    if (onLine) {
        let onLineTime = Date.now() - onLine;
        onLineTime = Math.ceil(onLineTime / 1000);
        // 记录在线时间
        sendJsons('updata', { playTime: parseInt(onLineTime) }, this);
    }
}

LLSE_Player.prototype.sendLoudspeaker = function () {
    let utw = mc.newCustomForm();
    utw.setTitle('发送世界喇叭');
    utw.addInput('内容', '1-50字符');
    utw.addDropdown('类型', ['小喇叭', '大喇叭'], 0);
    this.sendForm(utw, (player, datas) => {
        if (!datas) return;
        if (!datas[0]) {
            this.tell(`§d[跨服排行榜]§4 必须要有发送内容!`);
            return;
        }
        let btype = 'small';
        if (datas[1] == 1) btype = 'big';
        broadcast(this, datas[0], btype).then(res => {
            if (res.status == 200) {
                this.tell(`§d[跨服排行榜]§2 ${res.message}!`,5);
            }
        }).catch(err => {
            log('得到失败:',err);
            this.tell(`§d[跨服排行榜]§4 ${err.message}!`,5);
        });
    });
}



/**
 * json转Object
 * @param {String} text 
 * @returns 
 */
function toJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

/**
 * 连接websocket
 */
function connect() {
    wsc.connectAsync(`ws://${CONFIG.get('host')}/?key=${CONFIG.get('key')}&server=${encodeURIComponent(CONFIG.get('server'))}&showType=${CONFIG.get('showType')}`, res => {
        if (!res) {
            logger.error('连接失败 10 秒后尝试重新建立连接,请确保地址,key正确和server不重复!');
            setTimeout(() => {
                connect();//连接
            }, 10000);
            return;
        }
        colorLog('green', '连接成功,插件正常运行中!');
    });
}

/**
 * 玩家进入服务器
 */
mc.listen("onJoin", (player) => {
    player.startRtime();//记录进服时间
    // 记录在线人数
    setonlineTotal();
    sendJsons('killm', { llmoney: money.get(player.xuid) }, player);
});

mc.listen("onConsoleCmd", (cmd) => {
    if (/stop/i.test(cmd)) {
        // 记录在线人数
        setonlineTotal(0);
    }
});
/**
 * 玩家离开服务器
 */
mc.listen("onLeft", (player) => {
    player.endRtime();//提交在线时间
    // 记录在线人数
    setonlineTotal();
});

/**
* 玩家挖掘方块
*/
if (CONFIG.get('switch').destroyBlock) {
    mc.listen("onDestroyBlock", (player, block) => {
        player.recdestroy();//记录并提交
    });
}


mc.listen("onMoneyAdd", (xuid, newmoney) => {
    let fakepl = { realName: data.xuid2name(xuid), xuid };
    sendJsons('updata', { llmoney: money.get(xuid) }, fakepl);
});

mc.listen("onMoneyReduce", (xuid, newmoney) => {
    let fakepl = { realName: data.xuid2name(xuid), xuid };
    sendJsons('updata', { llmoney: money.get(xuid) }, fakepl);
});

mc.listen("onServerStarted", () => {
    setInterval(() => {
        // (每5秒同步一次)在线人数
        setonlineTotal();
    }, 10000);
    logger.warn(`启动完成! 作者:Yoyo QQ:1294858802`);
});

/**
 * 生物死亡
 */
mc.listen("onMobDie", (mob, source, cause) => {
    if (!source) return;
    let mobisPl = mob.isPlayer();
    let sourceisPl = source.isPlayer();
    if (mobisPl) {
        if (CONFIG.get('switch').dieRecord) {
            // 开启记录玩家死亡
            let mobpl = mob.toPlayer();
            sendJsons('updata', { die: 1 }, mobpl);
        }

        if (sourceisPl && CONFIG.get('switch').killRecord) {
            // 开启玩家击杀玩家
            let sourcepl = source.toPlayer();
            sendJsons('updata', { kill: 1 }, sourcepl);
        }
    } else {
        // 生物死亡
        if (sourceisPl && CONFIG.get('switch').killmRecord) {
            // 开启记录玩家击杀生物
            let sourcepl = source.toPlayer();
            sendJsons('updata', { killm: 1 }, sourcepl);
        }
    }
});


/**
 * 提交数据更新
 * @param {player} player 
 * @param {string} randType 
 * @param {int} value 
 */
function recordUpdate(player, randType, value) {
    if (!CONFIG.get('server')) {
        logger.error('请填写 server 1-10个字符');
        return;
    }
    request({
        url: 'index/updata',
        data: {
            server: CONFIG.get('server'),
            name: player.realName,
            xuid: player.xuid,
            [randType]: parseInt(value)
        }
    }).catch(err => {
        // 失败
        logger.error(err);
    });
}


/**
 * 发送喇叭请求
 * @param {player} player 
 * @param {string} text 内容
 * @param {string} btype 类型
 */
function broadcast(player, text, btype) {
    if (!CONFIG.get('server')) {
        logger.error('请填写 server 1-10个字符');
        return Promise.reject({ message: '服务器配置有误!' });
    }
    return request({
        url: 'index/broadcast',
        data: {
            server: CONFIG.get('server'),
            name: player.realName,
            xuid: player.xuid,
            btype,
            text
        }
    });
}


/**
 * 提交在线人数
 */
function setonlineTotal(count = undefined) {
    if (!CONFIG.get('server')) {
        logger.error('请填写 server 1-10个字符');
        return;
    }
    let OnlinePlayers = [];
    if (typeof count === 'undefined') {
        OnlinePlayers = mc.getOnlinePlayers();
    }
    sendJsons('setonlineTotal', { count: count ?? OnlinePlayers.length });
}

/**
 * 获取在线人数
 * @param {Object}
 */
function getonlineTotal() {
    return request({
        url: 'index/getonlineTotal',
    }).catch(err => {
        // 失败
        logger.error(err);
    });
}

/**
 * 获取所有玩家指定类型的排行榜
 * @param {string} randType 类型
 */
function getrankingPlayer(randType) {
    return request({
        url: 'index/rankingPlayer',
        data: {
            randType,
            count: CONFIG.get('maxShowCount') ?? 20,
        }
    }).catch(err => {
        // 失败
        logger.error(err);
    });
}

/**
 * 获取所有服务器指定类型的排行榜
 * @param {string} randType 类型
 */
function getrankingServer(randType) {
    return request({
        url: 'index/rankingServer',
        data: {
            randType,
            count: 20,
        }
    }).catch(err => {
        // 失败
        logger.error(err);
    });
}


/**
 * 发起请求函数
 * @param {object} options 
 * @returns 
 */
function request({ url, data } = options) {
    return new Promise((resolve, reject) => {
        if (!CONFIG.get('key')) {
            reject('key 未填写!!!!');
            return;
        }
        data = { ...data, key: CONFIG.get('key') };
        network.httpPost(`http://${CONFIG.get('host')}/${url}`, JSON.stringify(data), 'application/json', (status, result) => {
            if (status == 200) {
                try {
                    result = JSON.parse(result);
                    resolve(result);
                } catch (error) {
                    reject('返回格式不是JSON');
                }
                return;
            }

            try {
                result = JSON.parse(result);
            } catch (error) {}
            reject(result || '通信服务器失败! [http://' + CONFIG.get('host') + ']');
        });
    });
}

mc.regPlayerCmd('ph', '§l§d跨§g服§2排§4行§e榜', (pl, ages) => {
    if (ages[0] && (ages[0] == 'false' || ages[0] == '0')) {
        pl.setExtraData('randType', null);
        pl.removeSidebar();
        return;
    }
    let utw = mc.newSimpleForm();
    utw.setTitle('跨服排行榜');
    utw.addButton('死亡排行榜');
    utw.addButton('挖掘排行榜');
    utw.addButton('击杀生物排行榜');
    utw.addButton('击杀玩家排行榜');
    utw.addButton('LLmoney排行榜');
    utw.addButton('在线时长排行榜');
    utw.addButton('在线玩家人数');
    utw.addButton('§l§d发送世界喇叭');
    utw.addButton('§l§4关闭排行榜');
    pl.sendForm(utw, (pl, id) => {
        if (!id && id != 0) return;
        if (id == 7) {
            // 发送喇叭
            pl.sendLoudspeaker();
            return;
        }
        if (id == 8) {
            pl.setExtraData('randType', null);
            pl.removeSidebar();
            return;
        }
        let correspondTable = [{ typeName: "死亡", type: "die" }, { typeName: "挖掘", type: "digging" }, { typeName: "击杀生物", type: "killm" }, { typeName: "击杀玩家", type: "kill" }, { typeName: "llmoney", type: "llmoney" }, { typeName: "在线时长", type: "playTime" }, { typeName: "在线玩家", type: "sinfo" }];

        let randType = correspondTable[id];//取得类型
        // 在线人数
        if (randType.type == 'sinfo') {
            // 记录类型
            pl.setExtraData('randType', { type: randType.type, typeName: randType.typeName, show: '' });
            pl.tell('§d和服务器通信中!', 5);
            getonlineTotal().then(results => {
                results = results.data ?? {};
                let dataList = [];
                if (CONFIG.get('showType') == 'sidebar') {
                    dataList = dataList.map((v, i) => ({ text: i, value: v }));
                    let datass = {};
                    dataList.forEach((v, k) => {
                        datass[` ✰ ${k}  `] = v;
                    });
                    pl.removeSidebar();
                    pl.setSidebar(randType.typeName, datass);
                } else {
                    for (let item in results) {
                        dataList.push(`[${item}] => ${results[item]}`);
                    }
                    let utw = mc.newCustomForm();
                    utw.setTitle(randType.typeName);
                    utw.addLabel(dataList.join('\n\n'));
                    pl.sendForm(utw, () => { });
                }
            }).catch(err => {
                pl.tell('§4通信服务器失败!', 5);
                logger.error(err);
            });

            return;
        }
        pl.modal({
            text: '你要查看玩家还是服务器排行?',
            btnArr: ['玩家', '服务器'],
            ok: async (pl, res) => {
                if (res == null) return;
                pl.tell('§d和服务器通信中!', 5);
                if (res) {
                    // 玩家
                    // 记录类型
                    pl.setExtraData('randType', { type: randType.type, typeName: randType.typeName, show: 'pl' });
                    getrankingPlayer(randType.type).then(result => {
                        result = result.data ?? [];
                        sendutw(pl, randType.typeName, result, 'pl');
                    }).catch(err => {
                        pl.tell('§4通信服务器失败!', 5);
                    });

                } else {
                    // 服务器
                    // 记录类型
                    pl.setExtraData('randType', { type: randType.type, typeName: randType.typeName, show: 'server' });
                    getrankingServer(randType.type).then(result => {
                        result = result.data ?? [];
                        sendutw(pl, randType.typeName, result, 'server');
                    }).catch(err => {
                        pl.tell('§4通信服务器失败!', 5);
                    });


                }
            }
        });
    });
});


/**
 * 刷新指定玩家的侧边栏排行榜
 * @param {player} pl 玩家
 * @returns 
 */
function refreshData(pl, type) {
    let randType = pl.getExtraData('randType');
    if (!randType) return;
    if (randType.type != type) return;
    if (randType.type == 'sinfo') {
        // 在线人数
        if (glData['server_sinfo']) {
            pl.removeSidebar();
            pl.setSidebar(randType.typeName, glData['server_sinfo']);
            return;
        }
        return;
    }
    // 其它属性
    if (randType.show == 'pl') {
        // 玩家
        let cacheData = glData[`pl_${randType.type}`];
        if (cacheData) {
            sendutw(pl, randType.typeName, cacheData, 'pl');
            return;
        }
    } else {
        // 服务器
        let cacheData = glData[`server_${randType.type}`];
        if (cacheData) {
            sendutw(pl, randType.typeName, cacheData, 'server');
            return;
        }
    }
}


function sendutw(pl, title, datas, type = 'pl') {

    if (CONFIG.get('showType') == 'sidebar') {
        if (type == 'pl') {
            // 玩家
            datas = datas.map((v, i) => ({ text: ` ✰ [${v.server}] ${v.name}`, value: v.value }));
        } else {
            // 服务器
            datas = datas.map((v, i) => ({ text: ` ✰ [${v.server}]`, value: v.value }));
        }
        let datass = {};
        datas.forEach((v, k) => {
            datass[`${v.text}  `] = v.value;
        });
        pl.removeSidebar();
        pl.setSidebar(title + '排行榜', datass);
    } else {
        if (type == 'pl') {
            // 玩家
            datas = datas.map((v, i) => `${i + 1}、[${v.server}] ${v.name} => ${v.value}`);
        } else {
            // 服务器
            datas = datas.map((v, i) => `${i + 1}、[${v.server}] => ${v.value}`);
        }
        let utw = mc.newCustomForm();
        utw.setTitle(title + '排行榜');
        utw.addLabel(datas.join('\n\n'));
        pl.sendForm(utw, (pl, is) => { });
    }
}


/**
 * 先服务器推送一条信息
 * @param {string} controller 
 * @param {object} data 
 * @param {Player} pl 
 */
function sendJsons(controller, data, pl = {}) {
    let sendData = {
        wsType: controller,
        wsData: {
            server: CONFIG.get('server'),
            ...data
        }
    };
    if (pl.realName) sendData.wsData.name = pl.realName;
    if (pl.xuid) sendData.wsData.xuid = pl.xuid;
    wsc.send(JSON.stringify(sendData));
}


/**
 * 先服务器推送type
 * @param {string} controller 
 * @param {object} data 
 * @param {Player} pl 
 */
function sendolne(controller, data) {
    let sendData = {
        wsType: controller,
        wsData: {
            data
        }
    };
    wsc.send(JSON.stringify(sendData));
}
