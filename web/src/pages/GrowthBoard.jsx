import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Card, Space, Tag, message, Tabs, List } from "antd";
import { FallOutlined, RiseOutlined, FireOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from "../utils/api";
import { getUserTagColor } from "../utils/tagColors";

const { Title, Text } = Typography;

function RankBadge({ index }) {
  let color = "#d9d9d9";
  if (index === 0) color = "#f5222d";
  if (index === 1) color = "#fa8c16";
  if (index === 2) color = "#faad14";

  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: "bold",
        fontSize: 12,
      }}
    >
      {index + 1}
    </div>
  );
}

function TagsLine({ tags }) {
  if (!tags?.length) return null;
  return (
    <Space size={[6, 6]} wrap style={{ marginTop: 6 }}>
      {tags.map((tag) => (
        <Tag key={tag.id} color={getUserTagColor(tag.username)}>
          {tag.username}: {tag.tag_text}
        </Tag>
      ))}
    </Space>
  );
}

export default function GrowthBoard() {
  const { isMobile } = useOutletContext() || {};
  const [activeTab, setActiveTab] = useState("fans");
  const [fansData, setFansData] = useState([]);
  const [videosData, setVideosData] = useState([]);
  const [fansLoading, setFansLoading] = useState(false);
  const [videosLoading, setVideosLoading] = useState(false);

  const fetchFans = async () => {
    setFansLoading(true);
    try {
      const response = await api.get("/growth/fans");
      if (response.data.success) {
        setFansData(response.data.items || []);
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        message.error(error.response?.data?.message || "粉丝榜单加载失败");
      }
    } finally {
      setFansLoading(false);
    }
  };

  const fetchVideos = async () => {
    setVideosLoading(true);
    try {
      const response = await api.get("/growth/videos");
      if (response.data.success) {
        setVideosData(response.data.items || []);
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        message.error(error.response?.data?.message || "视频榜单加载失败");
      }
    } finally {
      setVideosLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "fans" && fansData.length === 0) {
      fetchFans();
    }
    if (activeTab === "videos" && videosData.length === 0) {
      fetchVideos();
    }
  }, [activeTab]);

  const fallbackEmpty = <Text disabled>按兵不动</Text>;

  const fansColumns = [
    {
      title: "榜单排名",
      key: "rank",
      width: 80,
      render: (_, __, index) => <RankBadge index={index} />,
    },
    {
      title: "UP 主",
      dataIndex: "uname",
      key: "uname",
      width: 360,
      render: (text, record) => (
        <Space size="middle" align="start">
          <Avatar src={record.face} size="large" style={{ border: "1px solid #f0f0f0" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#2a2a3e" }}>
                {text}
              </a>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              UID: {record.uid}
            </Text>
            <TagsLine tags={record.vtuber_tags} />
          </div>
        </Space>
      ),
    },
    {
      title: "当前体量",
      dataIndex: "today_fans",
      key: "today_fans",
      width: 170,
      render: (val) => <Text strong>{(val || 0).toLocaleString()} 粉丝</Text>,
    },
    {
      title: "单日野蛮生长（粉涨）",
      dataIndex: "fans_growth",
      key: "fans_growth",
      width: 200,
      render: (val) => {
        if (val > 0) return <Tag color="success" icon={<RiseOutlined />}>+{val} 空降粉丝</Tag>;
        if (val < 0) return <Tag color="error" icon={<FallOutlined />}>{val} 粉丝回落</Tag>;
        return fallbackEmpty;
      },
    },
  ];

  const videoColumns = [
    {
      title: "榜单排名",
      key: "rank",
      width: 80,
      render: (_, __, index) => <RankBadge index={index} />,
    },
    {
      title: "核心爆款视频",
      dataIndex: "title",
      key: "title",
      width: 420,
      render: (text, record) => (
        <Space size="middle" align="start">
          <Avatar src={record.cover_pic || record.face} shape="square" size={64} style={{ border: "1px solid #f0f0f0", borderRadius: 8 }} />
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 280 }}>
            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <a href={`https://www.bilibili.com/video/${record.bvid}`} target="_blank" rel="noreferrer" style={{ color: "#2a2a3e" }} title={text}>
                {text}
              </a>
            </div>
            <Space style={{ marginTop: 4 }}>
              <Avatar src={record.face} size="small" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.uname}
              </Text>
            </Space>
            <TagsLine tags={record.vtuber_tags} />
          </div>
        </Space>
      ),
    },
    {
      title: "单日引爆强度（播放）",
      dataIndex: "view_growth",
      key: "view_growth",
      width: 200,
      render: (val) => (val > 0 ? <Tag color="error" icon={<FireOutlined />}>+{val} 播放狂飙</Tag> : fallbackEmpty),
    },
    {
      title: "累计收视",
      dataIndex: "today_views",
      key: "today_views",
      width: 150,
      render: (val) => <Text strong>{(val || 0).toLocaleString()} 播放</Text>,
    },
  ];

  const MobileFansList = () => (
    <List
      dataSource={fansData}
      loading={fansLoading}
      pagination={false}
      split
      renderItem={(item, index) => (
        <List.Item style={{ padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", width: "100%", gap: 12, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -4, left: -4, background: "#fa8c16", color: "#fff", fontSize: 10, padding: "0 4px", borderRadius: 4, zIndex: 10, fontWeight: "bold" }}>
                {index + 1}
              </div>
              <Avatar src={item.face} size={56} style={{ border: "1px solid #f0f0f0" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <a href={`https://space.bilibili.com/${item.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222", fontSize: 14, fontWeight: 600 }}>
                {item.uname}
              </a>
              <Text type="secondary" style={{ fontSize: 12 }}>
                UID: {item.uid}
              </Text>
              <TagsLine tags={item.vtuber_tags} />
              <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(item.today_fans || 0).toLocaleString()} 粉丝
                </Text>
                {item.fans_growth > 0 ? <Tag color="success" style={{ margin: 0 }}>+{item.fans_growth}</Tag> : item.fans_growth < 0 ? <Tag color="error" style={{ margin: 0 }}>{item.fans_growth}</Tag> : null}
              </div>
            </div>
          </div>
        </List.Item>
      )}
    />
  );

  const MobileVideosList = () => (
    <List
      dataSource={videosData}
      loading={videosLoading}
      pagination={false}
      split
      renderItem={(item, index) => (
        <List.Item style={{ padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", width: "100%", gap: 12 }}>
            <div style={{ flexShrink: 0, position: "relative" }}>
              <div style={{ position: "absolute", top: 4, left: 4, background: "#fa7298", color: "#fff", fontSize: 10, padding: "0 4px", borderRadius: 4, zIndex: 10, fontWeight: "bold" }}>
                NO.{index + 1}
              </div>
              <img src={item.cover_pic || item.face} alt="cover" style={{ width: 140, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }} referrerPolicy="no-referrer" />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
              <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textOverflow: "ellipsis" }}>
                <a href={`https://www.bilibili.com/video/${item.bvid}`} target="_blank" rel="noreferrer" style={{ color: "#222", fontSize: 13, fontWeight: 600, lineHeight: "18px" }}>
                  {item.title}
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <Space size={4} style={{ flexShrink: 1, minWidth: 0, overflow: "hidden" }}>
                  <Avatar src={item.face} size={16} />
                  <Text type="secondary" ellipsis style={{ fontSize: 11, maxWidth: 70 }}>
                    {item.uname}
                  </Text>
                </Space>
                <TagsLine tags={item.vtuber_tags} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#fb7299" }}><PlayCircleOutlined /> {(item.today_views || 0).toLocaleString()}</span>
                <span style={{ color: "#52c41a" }}><FireOutlined /> +{(item.view_growth || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </List.Item>
      )}
    />
  );

  const items = [
    {
      key: "fans",
      label: <span style={{ fontSize: 16 }}><RiseOutlined /> 创作者涨粉榜</span>,
      children: isMobile ? <MobileFansList /> : <Table rowKey="uid" columns={fansColumns} dataSource={fansData} loading={fansLoading} pagination={false} scroll={{ x: 820 }} />,
    },
    {
      key: "videos",
      label: <span style={{ fontSize: 16 }}><FireOutlined /> 核心爆款视频榜</span>,
      children: isMobile ? <MobileVideosList /> : <Table rowKey="bvid" columns={videoColumns} dataSource={videosData} loading={videosLoading} pagination={false} scroll={{ x: 900 }} />,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>单日增长榜单</Title>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>
          同时观察涨粉最快的创作者和播放增长最快的单条视频。
        </Text>
      </div>

      <Card styles={{ body: { padding: isMobile ? 12 : 24 } }} variant="borderless" style={{ borderRadius: 12, boxShadow: "0 8px 24px rgba(250,114,152,0.1)" }}>
        <Tabs activeKey={activeTab} items={items} onChange={setActiveTab} />
      </Card>
    </div>
  );
}
