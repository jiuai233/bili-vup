// popup.js
var autoToggle = document.getElementById('autoToggle');
var statusEl = document.getElementById('status');
var secretInput = document.getElementById('pluginSecret');
var serverUrlInput = document.getElementById('serverUrl');

// 初始化读取
chrome.storage.local.get(['autoMode', 'pluginSecret', 'serverUrl'], function(result) {
    if (result.autoMode) {
        autoToggle.checked = true;
        statusEl.textContent = '自动模式已开启';
    }
    if (result.pluginSecret) {
        secretInput.value = result.pluginSecret;
    }
    if (result.serverUrl) {
        serverUrlInput.value = result.serverUrl;
    } else {
        serverUrlInput.value = "http://127.0.0.1:3009"; // 默认兜底
    }
});

// 切换时保存
autoToggle.addEventListener('change', function() {
    var isOn = autoToggle.checked;
    chrome.storage.local.set({ autoMode: isOn });
    statusEl.textContent = isOn ? '自动模式已开启' : '手动模式';
});

// 密钥框实时保存
secretInput.addEventListener('input', function(e) {
    chrome.storage.local.set({ pluginSecret: e.target.value });
});

// 接口配置实时保存
serverUrlInput.addEventListener('input', function(e) {
    chrome.storage.local.set({ serverUrl: e.target.value.trim() });
});

// 跳转到后台管理页
document.getElementById('goToAdminBtn').addEventListener('click', function() {
    var rawUrl = serverUrlInput.value.trim() || 'http://127.0.0.1:3009';
    var cleanUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
    chrome.tabs.create({ url: cleanUrl });
});
