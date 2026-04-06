// background.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'sendToServer') {
        chrome.storage.local.get(['pluginSecret', 'serverUrl'], function(result) {
            var token = result.pluginSecret;
            // 获取用户填写的云端地址，如果没有填写默认用本地 3009
            var baseHost = (result.serverUrl || 'http://127.0.0.1:3009').trim();
            // 在发请求时，我们把基础大门再加上我们要请求的 API 路由后缀
            if (baseHost.endsWith('/')) baseHost = baseHost.slice(0, -1);
            var TargetUrl = baseHost + '/api/plugin/vtubers';
            
            if (!token || token.trim() === '') {
                sendResponse({ success: false, error: '缺少鉴权令牌：请先在扩展弹窗中填入 Plugin API Key' });
                return;
            }

            fetch(TargetUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plugin-secret': token
                },
                body: JSON.stringify(request.data)
            })
            .then(function(res) {
                return res.text();
            })
            .then(function(text) {
                console.log('[background] 后台发来原件:', text);
                try {
                    var parsed = JSON.parse(text);
                    if (parsed.success) {
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: parsed.message || '系统鉴权驳回' });
                    }
                } catch(e) {
                    sendResponse({ success: false, error: '非预期错误包: ' + text.substring(0, 80) });
                }
            })
            .catch(function(err) {
                sendResponse({ success: false, error: '链接完全被截断(请确认3009端口监听): ' + err.message });
            });
        });

        // 异步响应预发
        return true; 
    }
});
