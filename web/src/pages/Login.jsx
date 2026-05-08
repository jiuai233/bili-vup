import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const { Title } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/login', values);
      if (res.data.success) {
        localStorage.setItem('bili_token', res.data.token);
        localStorage.setItem('bili_user', res.data.username);
        message.success('登录成功！');
        navigate('/');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.message) {
          message.error(err.response.data.message);
      } else {
          message.error('登录请求失败，请检查后端状态');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#171723' }}>
      <Card style={{ width: 380, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ color: '#fa7298', margin: 0 }}>Vtuber Monitor</Title>
          <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>Bilibili 活跃数据追踪系统</div>
        </div>
        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入管理员账号' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="管理员账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ background: '#fa7298', border: 'none' }}>
              登 录 后 台
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
