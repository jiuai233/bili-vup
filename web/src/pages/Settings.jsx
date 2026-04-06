import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Alert, Typography, Modal, Space } from 'antd';
import { SaveOutlined, QrcodeOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;

export default function Settings() {
  const { isMobile } = useOutletContext() || {};
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  // QR Login States
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrStatus, setQrStatus] = useState('waiting'); // waiting, expired, success
  const [qrMessage, setQrMessage] = useState('请使用哔哩哔哩移动端扫码');

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    let interval;
    if (qrModalVisible && qrData?.qrcode_key && qrStatus === 'waiting') {
       interval = setInterval(async () => {
           try {
               const res = await api.get(`/bilibili/qrcode/poll?qrcode_key=${qrData.qrcode_key}`);
               // B 站扫码成功落地 Node.js 加密
               if (res.data.success && res.data.code === 0) {
                   setQrStatus('success');
                   setQrMessage(res.data.message);
                   message.success("全局安全通行证已接管！");
                   setTimeout(() => {
                       setQrModalVisible(false);
                       fetchConfig(); // 重新加载页面配置看到状态
                   }, 2000);
               } else if (res.data.code === 86038) {
                   setQrStatus('expired');
                   setQrMessage("二维码已过期，请刷新重试");
               } else if (res.data.code === 86090) {
                   setQrMessage("已扫码，请在手机端点击确认登录");
               }
           } catch (e) {
               console.error("Poll error", e);
           }
       }, 2000);
    }
    return () => clearInterval(interval);
  }, [qrModalVisible, qrData, qrStatus]);

  const openQrScanner = async () => {
      setQrModalVisible(true);
      setQrStatus('waiting');
      setQrData(null);
      setQrMessage('正在向 B 站申请安全通行证...');
      try {
          const res = await api.get('/bilibili/qrcode/generate');
          if (res.data.success) {
              setQrData({ url: res.data.url, qrcode_key: res.data.qrcode_key });
              setQrMessage('请使用哔哩哔哩移动端扫码');
          }
      } catch(e) {
          setQrStatus('expired');
          setQrMessage('请求二维码失败');
      }
  };

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
          <div style={{ padding: '16px', backgroundColor: '#f0f5ff', borderRadius: '8px', border: '1px solid #d6e4ff', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                      <Title level={5} style={{ margin: 0, color: '#1677ff' }}>🚀 官方扫码安全授权 (推荐)</Title>
                      <Text type="secondary">无需手动抓取明文，扫码后自动进行 AES-256-GCM 强加密并写入系统底座，最高级别的安全防护。</Text>
                  </div>
                  <Button type="primary" size="large" icon={<QrcodeOutlined />} onClick={openQrScanner}>
                      扫码接管全局 Cookie
                  </Button>
              </div>
          </div>

          <Form.Item 
            label="Bilibili 网页端 Cookie (明文备用通道)" 
            name="bili_cookie"
            extra="强烈建议使用上方扫码功能。如果必须手填，请填入 SESSDATA 等字段的明文。"
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

      <Modal
         title="获取 B站全局安全通行证"
         open={qrModalVisible}
         onCancel={() => setQrModalVisible(false)}
         footer={null}
         width={400}
         centered
      >
         <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {qrStatus === 'success' ? (
                <div>
                   <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
                   <Title level={4}>授权大成功！</Title>
                   <Text type="secondary">{qrMessage}</Text>
                </div>
            ) : qrData ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                   <QRCodeSVG 
                      value={qrData.url} 
                      size={200} 
                      level="H"
                      imageSettings={{
                          src: "https://i0.hdslb.com/bfs/archive/48dcb1a1a5b8daabbdbcf826cd3bbdeab227b686.png",
                          height: 48,
                          width: 48,
                          excavate: true,
                      }} 
                   />
                   {qrStatus === 'expired' && (
                     <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                         <Text type="danger" strong style={{ marginBottom: 16 }}>二维码已失效</Text>
                         <Button type="primary" icon={<SyncOutlined />} onClick={openQrScanner}>刷新重试</Button>
                     </div>
                   )}
                </div>
            ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <SyncOutlined spin style={{ fontSize: 32, color: '#1677ff' }} />
                </div>
            )}
            
            {qrStatus !== 'success' && (
               <div style={{ marginTop: 24 }}>
                  <Text strong style={{ fontSize: 16 }}>{qrMessage}</Text>
               </div>
            )}
         </div>
      </Modal>
    </div>
  );
}
