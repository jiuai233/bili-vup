import React, { useState } from 'react';
import { Layout, Menu, Button, Drawer, Grid } from 'antd';
import { TeamOutlined, SettingOutlined, LogoutOutlined, LineChartOutlined, PlaySquareOutlined, HistoryOutlined, StopOutlined, MenuOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem('bili_user') || '管理员';
  const [drawerVisible, setDrawerVisible] = useState(false);
  const screens = useBreakpoint();
  const isMobile = screens.md === false; // AntD breakpoint (md = 768px). Returns false when strictly narrower.

  const onMenuClick = (e) => {
    navigate(e.key);
    setDrawerVisible(false);
  };

  const doLogout = () => {
    localStorage.removeItem('bili_token');
    localStorage.removeItem('bili_user');
    navigate('/login');
  };

  const menuNode = (
    <Menu 
      theme="dark" 
      mode="inline" 
      style={{ background: '#171723', marginTop: 16, borderRight: 'none' }}
      selectedKeys={[location.pathname]}
      onClick={onMenuClick}
      items={[
        { key: '/', icon: <TeamOutlined />, label: '全域名单板' },
        { key: '/growth', icon: <LineChartOutlined />, label: '飙升爆款榜' },
        { key: '/monthly', icon: <HistoryOutlined />, label: '月度百大榜单' },
        { key: '/videos', icon: <PlaySquareOutlined />, label: '全域视频库' },
        { key: '/banned', icon: <StopOutlined />, label: '全域封禁管理' },
        { key: '/settings', icon: <SettingOutlined />, label: '系统中心与凭证' },
      ]}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          title={<span style={{ color: '#fa7298', fontWeight: 'bold' }}>Vtuber Monitor</span>}
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          styles={{ body: { padding: 0, background: '#171723' }, header: { background: '#171723', borderBottom: '1px solid #2a2a3e' } }}
          closeIcon={<span style={{color: '#fff', fontSize: '16px'}}>✕</span>}
          width={240}
        >
          {menuNode}
        </Drawer>
      ) : (
        <Sider width={240} theme="dark" style={{ overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 999, background: '#171723' }}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #2a2a3e' }}>
            <span style={{ color: '#fa7298', fontWeight: 'bold', fontSize: 18, letterSpacing: 1 }}>Vtuber Monitor</span>
          </div>
          {menuNode}
        </Sider>
      )}
      <Layout style={{ marginLeft: isMobile ? 0 : 240, minHeight: '100vh', transition: 'margin-left 0.2s' }}>
        <Header style={{ background: '#fff', padding: isMobile ? '0 16px' : '0 24px', display: 'flex', justifyContent: isMobile ? 'space-between' : 'flex-end', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {isMobile && (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerVisible(true)} style={{ fontSize: '18px', padding: '0 8px' }} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>欢迎, <b>{username}</b></span>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={doLogout}>安全退出</Button>
          </div>
        </Header>
        <Content style={{ margin: isMobile ? '16px 12px 0' : '24px 24px 0', minHeight: 280 }}>
          <Outlet context={{ isMobile }} />
        </Content>
      </Layout>
    </Layout>
  );
}
