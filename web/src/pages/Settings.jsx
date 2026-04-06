import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Alert, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;

export default function Settings() {
  const { isMobile } = useOutletContext() || {};
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await api.get('/config');
      if (res.data.success) {
        let initialValues = {};
        res.data.configs.forEach(c => {
          initialValues[c.config_key] = c.config_value;
        });
        form.setFieldsValue(initialValues);
      }
    } catch (e) {
      message.error("未能获取当前系统配置");
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // 组装成后端所需的数组格式: [{config_key, config_value}]
      const configsArray = Object.keys(values).map(key => ({
        config_key: key,
        config_value: String(values[key])
      }));
      
      const res = await api.put('/config', { configs: configsArray });
      if (res.data.success) {
        message.success('配置更新成功！');
      }
    } catch (e) {
      message.error(e.response?.data?.message || '配置更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>系统调度配置</Title>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>在此配置爬虫所需凭证以及任务过滤阈值，保存即时生效。</Text>
      </div>

      <Card styles={{ body: { padding: isMobile ? '12px' : '24px' } }} variant="borderless" style={{ maxWidth: 800, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <Alert 
          message="防封禁提示" 
          description="B站对于短时间大量拉取接口有严格风控。务必设置合理的 fetch_delay_ms（建议2000以上），且 Cookie 必须是有效的 SESSDATA 组合。" 
          type="warning" 
          showIcon 
          style={{ marginBottom: 24 }} 
        />
        
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item 
            label="Bilibili 网页端 Cookie (核心身份凭证)" 
            name="bili_cookie"
            extra="请登录 Bilibili 网页版后，在浏览器控制台输入 document.cookie 获取。必须包含 SESSDATA 等关键部分。"
          >
            <Input.TextArea rows={4} placeholder="buvid3=...; SESSDATA=...; bili_jct=..." />
          </Form.Item>

          <Form.Item 
            label="最小粉丝数门槛 (min_fans_limit)" 
            name="min_fans_limit"
            extra="每日计划任务筛选主播的硬性条件。如：2000"
          >
            <Input type="number" placeholder="2000" style={{ width: 200 }} />
          </Form.Item>

          <Form.Item 
            label="接口请求风控延时 - 毫秒 (fetch_delay_ms)" 
            name="fetch_delay_ms"
            extra="每查一位 UP 主后强制休眠的时间。太低极容易被封IP禁查。"
          >
            <Input type="number" placeholder="2500" style={{ width: 200 }} />
          </Form.Item>

          <Form.Item style={{ marginTop: 32 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large">
              下发更新配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
