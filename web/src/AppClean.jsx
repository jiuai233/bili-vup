import { useMemo, useState } from "react";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Layout,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("zh-CN");
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

async function fetchVideos(uid, cookie) {
  const headers = cookie.trim() ? { "x-bilibili-cookie": cookie.trim() } : {};
  const response = await fetch(`/api/videos?uid=${encodeURIComponent(uid)}`, { headers });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return payload;
}

function Dashboard() {
  const { message } = AntdApp.useApp();
  const [uid, setUid] = useState("3723075");
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const columns = useMemo(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        key: "title",
        render: (value, record) => (
          <Space direction="vertical" size={2}>
            <a
              href={`https://www.bilibili.com/video/${record.bvid}`}
              rel="noreferrer"
              target="_blank"
            >
              {value}
            </a>
            <Text type="secondary">{record.bvid}</Text>
          </Space>
        ),
      },
      {
        title: "发布时间",
        dataIndex: "created",
        key: "created",
        width: 180,
        render: (value) => formatDate(value),
      },
      {
        title: "播放",
        dataIndex: "play",
        key: "play",
        width: 120,
        align: "right",
        render: (value) => formatNumber(value),
      },
      {
        title: "评论",
        dataIndex: "comment",
        key: "comment",
        width: 120,
        align: "right",
        render: (value) => formatNumber(value),
      },
      {
        title: "时长",
        dataIndex: "length",
        key: "length",
        width: 110,
      },
    ],
    []
  );

  const stats = useMemo(() => {
    if (!result) {
      return null;
    }

    const totalPlay = result.videos.reduce((sum, item) => sum + item.play, 0);
    const totalComment = result.videos.reduce((sum, item) => sum + item.comment, 0);

    return {
      count: result.count,
      totalPlay,
      totalComment,
    };
  }, [result]);

  const handleSearch = async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchVideos(uid.trim(), cookie);
      setResult(payload);
      message.success(`已加载 ${payload.count} 条视频`);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <div>
          <Title level={3} className="app-title">
            B站主播近三个月视频概览
          </Title>
          <Text className="app-subtitle">输入 UID，查看最近三个月投稿情况。</Text>
        </div>
      </Header>
      <Content className="app-content">
        <Card className="search-card">
          <Form layout="vertical" onFinish={handleSearch}>
            <Space wrap size={16} align="end">
              <Form.Item label="主播 UID" required style={{ marginBottom: 0 }}>
                <Input
                  placeholder="例如 3723075"
                  value={uid}
                  onChange={(event) => setUid(event.target.value)}
                  style={{ width: 220 }}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading}>
                  查询
                </Button>
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Tag color="blue">固定范围：近三个月</Tag>
              </Form.Item>
            </Space>
            <Form.Item
              label="BILIBILI_COOKIE"
              extra="可选。遇到 B站风控 时填写，例如：SESSDATA=xxx; bili_jct=xxx"
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 6 }}
                placeholder="SESSDATA=你的值; bili_jct=你的值"
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
              />
            </Form.Item>
          </Form>
        </Card>

        {error ? (
          <Alert
            className="section-gap"
            message="请求失败"
            description={error}
            type="error"
            showIcon
          />
        ) : null}

        {stats ? (
          <div className="stats-grid section-gap">
            <Card>
              <Statistic title="视频数" value={stats.count} />
            </Card>
            <Card>
              <Statistic
                title="总播放"
                value={stats.totalPlay}
                formatter={(value) => formatNumber(value)}
              />
            </Card>
            <Card>
              <Statistic
                title="总评论"
                value={stats.totalComment}
                formatter={(value) => formatNumber(value)}
              />
            </Card>
          </div>
        ) : null}

        <Card className="section-gap">
          {loading ? (
            <div className="center-box">
              <Spin size="large" />
            </div>
          ) : result ? (
            <Table
              rowKey="bvid"
              columns={columns}
              dataSource={result.videos}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 840 }}
            />
          ) : (
            <Empty description="输入 UID 后开始查询" />
          )}
        </Card>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <AntdApp>
      <Dashboard />
    </AntdApp>
  );
}
