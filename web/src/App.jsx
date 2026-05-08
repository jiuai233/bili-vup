import React, { lazy, Suspense } from "react";
import { App as AntdApp, Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ─── 路由懒加载：每个页面独立 chunk，按需下载 ───
const AdminWorkbench = lazy(() => import("./pages/AdminWorkbench"));
const VtubersDesk = lazy(() => import("./pages/VtubersDesk"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const GrowthBoard = lazy(() => import("./pages/GrowthBoard"));
const VideoLibraryRoomPage = lazy(() => import("./pages/VideoLibraryRoomPage"));
const MonthlyRanking = lazy(() => import("./pages/MonthlyRanking"));
const BannedList = lazy(() => import("./pages/BannedList"));

// 懒加载过渡态：居中 spinner
const LazyFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="加载中…" />
  </div>
);

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
        <Suspense fallback={LazyFallback}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* 这里是主管理路由群，所有受保护界面的包装 */}
            <Route path="/" element={<RequireAuth><AdminWorkbench /></RequireAuth>}>
               <Route index element={<VtubersDesk />} />
               <Route path="favorites" element={<VtubersDesk favoritesOnly />} />
               <Route path="growth" element={<GrowthBoard />} />
               <Route path="videos" element={<VideoLibraryRoomPage />} />
               <Route path="monthly" element={<MonthlyRanking />} />
               <Route path="banned" element={<BannedList />} />
               <Route path="settings" element={<Settings />} />
            </Route>
            
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AntdApp>
  );
}
