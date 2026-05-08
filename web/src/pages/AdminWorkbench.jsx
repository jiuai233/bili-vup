import React, { useState } from "react";
import { Layout, Menu, Button, Drawer, Grid } from "antd";
import {
  HistoryOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlaySquareOutlined,
  SettingOutlined,
  StarOutlined,
  StopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function AdminWorkbench() {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("bili_user") || "管理员";
  const [drawerVisible, setDrawerVisible] = useState(false);
  const screens = useBreakpoint();
  const isMobile = screens.md === false;

  const handleLogout = () => {
    localStorage.removeItem("bili_token");
    localStorage.removeItem("bili_user");
    navigate("/login");
  };

  const items = [
    { key: "/", icon: <TeamOutlined />, label: "主播列表" },
    { key: "/favorites", icon: <StarOutlined />, label: "收藏主播" },
    { key: "/growth", icon: <LineChartOutlined />, label: "增长榜单" },
    { key: "/monthly", icon: <HistoryOutlined />, label: "月榜" },
    { key: "/videos", icon: <PlaySquareOutlined />, label: "视频库" },
    { key: "/banned", icon: <StopOutlined />, label: "封禁管理" },
    { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
  ];

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={({ key }) => {
        navigate(key);
        setDrawerVisible(false);
      }}
      style={{ background: "#171723", marginTop: 16, borderRight: "none" }}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {isMobile ? (
        <Drawer
          title={<span style={{ color: "#fa7298", fontWeight: 700 }}>Vtuber Monitor</span>}
          placement="left"
          open={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          width={240}
          styles={{
            body: { padding: 0, background: "#171723" },
            header: { background: "#171723", borderBottom: "1px solid #2a2a3e" },
          }}
        >
          {menu}
        </Drawer>
      ) : (
        <Sider
          width={240}
          theme="dark"
          style={{
            overflow: "auto",
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            background: "#171723",
          }}
        >
          <div
            style={{
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderBottom: "1px solid #2a2a3e",
            }}
          >
            <span style={{ color: "#fa7298", fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
              Vtuber Monitor
            </span>
          </div>
          {menu}
        </Sider>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : 240, minHeight: "100vh" }}>
        <Header
          style={{
            background: "#fff",
            padding: isMobile ? "0 16px" : "0 24px",
            display: "flex",
            justifyContent: isMobile ? "space-between" : "flex-end",
            alignItems: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          {isMobile ? (
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerVisible(true)} />
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span>
              欢迎，<b>{username}</b>
            </span>
            <Button type="text" danger icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </Header>

        <Content style={{ margin: isMobile ? "16px 12px 0" : "24px 24px 0", minHeight: 280 }}>
          <Outlet context={{ isMobile }} />
        </Content>
      </Layout>
    </Layout>
  );
}
