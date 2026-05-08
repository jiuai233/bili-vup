import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { MessageOutlined, PlayCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from "../utils/api";
import { getUserTagColor } from "../utils/tagColors";

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

export default function VideoLibraryRoomPage() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState("view_count");
  const [sortOrder, setSortOrder] = useState("DESC");
  const [keyword, setKeyword] = useState("");
  const [vtuberTagKeyword, setVtuberTagKeyword] = useState("");
  const [minViews, setMinViews] = useState(null);
  const [maxViews, setMaxViews] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });

  const fetchData = async (page, limit, sort, order, kw, minV, maxV, vtuberTag) => {
    setLoading(true);
    try {
      let url = `/videos?page=${page}&limit=${limit}&sort=${sort}&sortOrder=${order}`;
      if (kw) url += `&keyword=${encodeURIComponent(kw)}`;
      if (vtuberTag) url += `&vtuberTag=${encodeURIComponent(vtuberTag)}`;
      if (minV !== null && minV !== undefined) url += `&minViews=${minV}`;
      if (maxV !== null && maxV !== undefined) url += `&maxViews=${maxV}`;

      const res = await api.get(url);
      if (res.data.success) {
        setData(res.data.data || []);
        setTotal(res.data.total || 0);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(
      pagination.current,
      pagination.pageSize,
      sortField,
      sortOrder,
      keyword,
      minViews,
      maxViews,
      vtuberTagKeyword
    );
  }, [pagination.current, pagination.pageSize, sortField, sortOrder, keyword, minViews, maxViews, vtuberTagKeyword]);

  const resetFilters = () => {
    setKeyword("");
    setVtuberTagKeyword("");
    setMinViews(null);
    setMaxViews(null);
    setSortField("view_count");
    setSortOrder("DESC");
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns = useMemo(() => ([
    {
      title: "视频",
      dataIndex: "title",
      key: "title",
      width: 420,
      render: (_, record) => (
        <Space size="middle">
          <Avatar src={record.cover_pic || record.face} shape="square" size={64} style={{ borderRadius: 8 }} />
          <div style={{ maxWidth: 320 }}>
            <div style={{ fontWeight: 600 }}>
              <a href={`https://www.bilibili.com/video/${record.bvid}`} target="_blank" rel="noreferrer">
                {record.title}
              </a>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              发布于 {new Date(record.pubdate).toLocaleString("zh-CN")}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Space size={[6, 6]} wrap>
                {(record.vtuber_tags || []).map((tag) => (
                  <Tag key={tag.id} color={getUserTagColor(tag.username)}>
                    {tag.username}: {tag.tag_text}
                  </Tag>
                ))}
              </Space>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "所属主播",
      dataIndex: "uname",
      key: "uname",
      width: 160,
      render: (_, record) => (
        <Space>
          <Avatar src={record.face} size="small" />
          <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer">
            {record.uname}
          </a>
        </Space>
      ),
    },
    {
      title: "播放",
      dataIndex: "view_count",
      key: "view_count",
      width: 140,
      render: (value) => <Tag color="blue" icon={<PlayCircleOutlined />}>{(value || 0).toLocaleString()}</Tag>,
    },
    {
      title: "评论",
      dataIndex: "reply_count",
      key: "reply_count",
      width: 140,
      render: (value) => <Tag color="purple" icon={<MessageOutlined />}>{(value || 0).toLocaleString()}</Tag>,
    },
  ]), []);

  return (
    <Card
      styles={{ body: { padding: isMobile ? 12 : 24 } }}
      variant="borderless"
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.05)", borderRadius: 12 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>全域视频库</Title>
          <Text type="secondary">可按主播标签筛选并带出该主播稿件，共 {total} 条</Text>
        </div>

        <Space wrap>
          <Search
            placeholder="按主播昵称筛选"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => setPagination((prev) => ({ ...prev, current: 1 }))}
            style={{ width: 220 }}
            enterButton={<SearchOutlined />}
          />
          <Input
            placeholder="按主播标签筛选"
            value={vtuberTagKeyword}
            onChange={(e) => setVtuberTagKeyword(e.target.value)}
            style={{ width: 180 }}
          />
          <InputNumber min={0} placeholder="最小播放" value={minViews} onChange={setMinViews} style={{ width: 120 }} />
          <InputNumber min={0} placeholder="最大播放" value={maxViews} onChange={setMaxViews} style={{ width: 120 }} />
          <Select value={sortField} style={{ width: 140 }} onChange={setSortField}>
            <Option value="view_count">按播放</Option>
            <Option value="reply_count">按评论</Option>
            <Option value="pubdate">按发布时间</Option>
          </Select>
          <Select value={sortOrder} style={{ width: 100 }} onChange={setSortOrder}>
            <Option value="DESC">倒序</Option>
            <Option value="ASC">正序</Option>
          </Select>
          <Button onClick={resetFilters}>重置</Button>
        </Space>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
            showSizeChanger: false,
          }}
          renderItem={(item) => (
            <List.Item>
              <div style={{ display: "flex", width: "100%", gap: 12 }}>
                <img
                  src={item.cover_pic}
                  alt="cover"
                  style={{ width: 140, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }}
                  referrerPolicy="no-referrer"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    <a href={`https://www.bilibili.com/video/${item.bvid}`} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Space size={4}>
                      <Avatar src={item.face} size={16} />
                      <Text type="secondary" ellipsis>{item.uname}</Text>
                    </Space>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Space size={8}>
                      <span style={{ color: "#fb7299" }}><PlayCircleOutlined /> {(item.view_count || 0).toLocaleString()}</span>
                      <span><MessageOutlined /> {(item.reply_count || 0).toLocaleString()}</span>
                    </Space>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Space size={[6, 6]} wrap>
                      {(item.vtuber_tags || []).map((tag) => (
                        <Tag key={tag.id} color={getUserTagColor(tag.username)}>
                          {tag.username}: {tag.tag_text}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              </div>
            </List.Item>
          )}
        />
      ) : (
        <Table
          rowKey="bvid"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
          }}
        />
      )}
    </Card>
  );
}
