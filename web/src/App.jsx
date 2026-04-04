import { useEffect, useState, useRef } from "react";
import { App as AntdApp, Layout, Table, Typography, Avatar, Card, Space, Tag, Input } from "antd";

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { Search } = Input;

function VtubersList() {
  const { message } = AntdApp.useApp();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
  });

  const fetchData = async (page, pageSize, searchVal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/vtubers?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(searchVal)}`);
      const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.message || "请求服务器失败，请确保您启动了后端");
      }
      
      setData(payload.items || []);
      setTotal(payload.total || 0);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 避免使用旧闭包参数引发 bug，使用 useRef 或者将状态解耦
  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, keyword);
    
    const interval = setInterval(() => {
       // 当用户没有在执行搜索行为时，大屏才触发自动刷新，避免打断用户的阅览
       fetchData(pagination.current, pagination.pageSize, keyword);
    }, 30000);
    return () => clearInterval(interval);
  }, [pagination.current, pagination.pageSize, keyword]);

  const handleTableChange = (newPagination) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const handleSearch = (value) => {
    setKeyword(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns = [
    {
      title: "主播身份",
      dataIndex: "uname",
      key: "uname",
      width: 250,
      render: (text, record) => (
        <Space size="middle">
          <Avatar 
            src={record.face} 
            size="large" 
            style={{ border: '1px solid #f0f0f0', backgroundColor: '#f5f5f5' }} 
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>
              <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222" }}>
                {text}
              </a>
            </div>
            <Text type="secondary" style={{ fontSize: "12px" }}>UID: {record.uid}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "全站投稿总量 (件)",
      dataIndex: "video_count",
      key: "video_count",
      width: 150,
      render: (val) => (
        <Text strong style={{ color: "#ff6699", fontSize: "18px" }}>
          {val}
        </Text>
      )
    },
    {
      title: "直播间",
      dataIndex: "roomid",
      key: "roomid",
      width: 150,
      render: (roomid) => roomid ? (
        <a href={`https://live.bilibili.com/${roomid}`} target="_blank" rel="noreferrer" style={{color: "#1677ff"}}>
          进入直播间 ↗
        </a>
      ) : <Text type="secondary">-</Text>
    },
    {
      title: "系统落库时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 200,
      render: (val) => val ? new Date(val).toLocaleString("zh-CN") : "-",
    },
  ];

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header className="app-header" style={{ background: '#fff', padding: '0 50px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0, fontWeight: "bold" }}>
          🔥 B站活跃主播全网大名单
        </Title>
      </Header>
      
      <Content className="app-content" style={{ padding: "30px 50px" }}>
        <Card 
          title={`系统已匹配记录 (${total} 名)`} 
          bordered={false} 
          style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
          extra={
            <Search 
              placeholder="通过 UID 或 昵称快速精准过滤..." 
              allowClear 
              onSearch={handleSearch} 
              style={{ width: 320 }}
              enterButton
            />
          }
        >
          <Table
            rowKey="uid"
            columns={columns}
            dataSource={data}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `共查出 ${total} 个人员`
            }}
          />
        </Card>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <AntdApp>
      <VtubersList />
    </AntdApp>
  );
}
