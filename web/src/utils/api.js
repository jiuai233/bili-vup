import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

// 在每个请求前自动附带 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bili_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 处理全局 401 拦截
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    localStorage.removeItem('bili_token');
    // 对于 401，我们重定向到登录页
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
  }
  return Promise.reject(error);
});

export default api;
