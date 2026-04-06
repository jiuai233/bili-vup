import React from "react";
import { App as AntdApp } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "./pages/AdminLayout";
import VtubersList from "./pages/VtubersList";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import GrowthList from "./pages/GrowthList";
import VideoLibraryRoom from "./pages/VideoLibraryRoom";
import MonthlyRanking from "./pages/MonthlyRanking";
import BannedList from "./pages/BannedList";

// 简单的路由拦截守护
const RequireAuth = ({ children }) => {
  const token = localStorage.getItem('bili_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <AntdApp>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* 这里是主管理路由群，所有受保护界面的包装 */}
          <Route path="/" element={<RequireAuth><AdminLayout /></RequireAuth>}>
             <Route index element={<VtubersList />} />
             <Route path="growth" element={<GrowthList />} />
             <Route path="videos" element={<VideoLibraryRoom />} />
             <Route path="monthly" element={<MonthlyRanking />} />
             <Route path="banned" element={<BannedList />} />
             <Route path="settings" element={<Settings />} />
          </Route>
          
        </Routes>
      </BrowserRouter>
    </AntdApp>
  );
}
