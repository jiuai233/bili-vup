// content.js
(function () {
    'use strict';

    var autoMode = false;
    var isSending = false;
    var btn = null;
    var titleDiv = null;
    var subDiv = null;

    // 读取 auto 模式
    chrome.storage.local.get('autoMode', function (result) {
        autoMode = !!result.autoMode;
        createBtn();
        if (autoMode) {
            setTimeout(doSend, 2000);
        }
    });

    // 监听设置变更（popup 里切换后实时生效）
    chrome.storage.onChanged.addListener(function (changes) {
        if (changes.autoMode) {
            autoMode = !!changes.autoMode.newValue;
            if (subDiv && !isSending) {
                subDiv.textContent = autoMode ? '[AUTO] 访问即入库' : '点击手动推送';
            }
        }
    });

    function getUid() {
        var pathParts = window.location.pathname.split('/');
        var uid = pathParts[1];
        if (!uid || isNaN(uid)) return null;
        return uid;
    }

    function doSend() {
        if (isSending) return;
        var uid = getUid();
        if (!uid) return;

        isSending = true;
        setStatus('fetching');

        var cardUrl = 'https://api.bilibili.com/x/web-interface/card?mid=' + uid;
        var statUrl = 'https://api.bilibili.com/x/relation/stat?vmid=' + uid;
        var navUrl = 'https://api.bilibili.com/x/space/navnum?mid=' + uid;

        Promise.all([
            fetch(cardUrl).then(function (r) { return r.json(); }),
            fetch(statUrl).then(function (r) { return r.json(); }),
            fetch(navUrl).then(function (r) { return r.json(); })
        ]).then(function (results) {
            var cardRes = results[0];
            var statRes = results[1];
            var navRes = results[2];

            if (cardRes.code !== 0) {
                throw new Error('B站API返回 code=' + cardRes.code);
            }

            var uname = cardRes.data.card.name;
            var face = cardRes.data.card.face;
            var sign = cardRes.data.card.sign;
            var follower_count = (statRes.data && statRes.data.follower) ? statRes.data.follower : 0;
            var recent_video_count = (navRes.data && navRes.data.video) ? navRes.data.video : 0;

            setStatus('pushing');

            chrome.runtime.sendMessage({
                action: 'sendToServer',
                data: {
                    uid: uid, uname: uname, face: face, sign: sign,
                    follower_count: follower_count, recent_video_count: recent_video_count
                }
            }, function (response) {
                isSending = false;
                if (chrome.runtime.lastError) {
                    setStatus('error', chrome.runtime.lastError.message);
                } else if (response && response.success) {
                    setStatus('success', uname + ' | 粉丝:' + follower_count);
                } else {
                    setStatus('error', (response && response.error) ? response.error : '未知错误');
                }
                // 5秒后恢复
                setTimeout(function () { setStatus('idle'); }, 5000);
            });

        }).catch(function (err) {
            isSending = false;
            console.error('[插件] 请求失败:', err);
            setStatus('error', err.message);
            setTimeout(function () { setStatus('idle'); }, 5000);
        });
    }

    function setStatus(state, msg) {
        if (!btn) return;
        switch (state) {
            case 'fetching':
                btn.style.backgroundColor = '#E6A23C';
                titleDiv.textContent = '正在获取B站数据...';
                subDiv.textContent = '';
                break;
            case 'pushing':
                btn.style.backgroundColor = '#E6A23C';
                titleDiv.textContent = '正在推送到后台...';
                subDiv.textContent = '';
                break;
            case 'success':
                btn.style.backgroundColor = '#67C23A';
                titleDiv.textContent = '录入成功';
                subDiv.textContent = msg || '';
                break;
            case 'error':
                btn.style.backgroundColor = '#F56C6C';
                titleDiv.textContent = '出错';
                subDiv.textContent = msg || '';
                break;
            default:
                btn.style.backgroundColor = '#fa7298';
                titleDiv.textContent = '加 入 监 控 ';
                subDiv.textContent = autoMode ? '[AUTO] 访问即入库' : '点击手动推送';
                break;
        }
    }

    function createBtn() {
        if (document.getElementById('bili-monitor-btn')) return;

        btn = document.createElement('div');
        btn.id = 'bili-monitor-btn';
        btn.style.position = 'fixed';
        btn.style.bottom = '30px';
        btn.style.right = '30px';
        btn.style.zIndex = '999999';
        btn.style.padding = '12px 22px';
        btn.style.backgroundColor = '#fa7298';
        btn.style.color = '#fff';
        btn.style.borderRadius = '8px';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        btn.style.fontFamily = 'Microsoft YaHei, sans-serif';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background-color 0.3s, transform 0.2s';

        titleDiv = document.createElement('div');
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '15px';
        titleDiv.textContent = '加 入 监 控 ';

        subDiv = document.createElement('div');
        subDiv.style.fontSize = '11px';
        subDiv.style.marginTop = '4px';
        subDiv.style.opacity = '0.9';
        subDiv.textContent = autoMode ? '[AUTO] 访问即入库' : '点击手动推送';

        btn.appendChild(titleDiv);
        btn.appendChild(subDiv);

        btn.onmouseover = function () { btn.style.transform = 'scale(1.05)'; };
        btn.onmouseout = function () { btn.style.transform = 'scale(1)'; };
        btn.onclick = function () { doSend(); };

        document.body.appendChild(btn);
    }

    // B站 SPA 路由变化检测
    var lastUrl = window.location.href;
    new MutationObserver(function () {
        var url = window.location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.indexOf('space.bilibili.com/') !== -1) {
                var old = document.getElementById('bili-monitor-btn');
                if (old) old.remove();
                btn = null; titleDiv = null; subDiv = null;
                setTimeout(function () {
                    createBtn();
                    if (autoMode) {
                        setTimeout(doSend, 1000);
                    }
                }, 1500);
            }
        }
    }).observe(document.body || document.documentElement, { subtree: true, childList: true });

})();
