import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Space, Select, Tag, Card, Input, InputNumber, Button, List } from "antd";
import { PlayCircleOutlined, MessageOutlined, SearchOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

export default function VideoLibraryRoom() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('view_count');
  const [sortOrder, setSortOrder] = useState('DESC');
  
  const [keyword, setKeyword] = useState("");
  const [minViews, setMinViews] = useState(null);
  const [maxViews, setMaxViews] = useState(null);

  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
  });

  const fetchData = async (page, limit, sort, order, kw, minV, maxV) => {
    setLoading(true);
    try {
      let url = `/videos?page=${page}&limit=${limit}&sort=${sort}&sortOrder=${order}`;
      if (kw) url += `&keyword=${encodeURIComponent(kw)}`;
      if (minV !== null && minV !== undefined) url += `&minViews=${minV}`;
      if (maxV !== null && maxV !== undefined) url += `&maxViews=${maxV}`;
      
      const res = await api.get(url);
      if (res.data.success) {
        setData(res.data.data);
        setTotal(res.data.total);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, sortField, sortOrder, keyword, minViews, maxViews);
  }, [pagination.current, pagination.pageSize, sortField, sortOrder, keyword, minViews, maxViews]);

  const handleTableChange = (pag) => {
    setPagination(pag);
  };

  const resetFilters = () => {
    setKeyword("");
    setMinViews(null);
    setMaxViews(null);
    setSortField("view_count");
    setSortOrder("DESC");
    setPagination({ ...pagination, current: 1 });
  };

  const onSortChange = (val) => {
    setSortField(val);
    setPagination({ ...pagination, current: 1 });
  };

  const onSortOrderChange = (val) => {
    setSortOrder(val);
    setPagination({ ...pagination, current: 1 });
  };

  const columns = [
    {
      title: "视频档案",
      dataIndex: "title",
      key: "title",
      width: 400,
      render: (text, record) => (
        <Space size="middle">
          <Avatar src={record.cover_pic || record.face} shape="square" size={64} style={{ border: '1px solid #f0f0f0', borderRadius: '8px' }} />
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 300 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <a href={`https://www.bilibili.com/video/${record.bvid}`} target="_blank" rel="noreferrer" style={{ color: "#2a2a3e" }} title={text}>{text}</a>
            </div>
            <Text type="secondary" style={{ fontSize: "12px", marginTop: 4 }}>
               投稿于: {new Date(record.pubdate).toLocaleString()}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "归属主播",
      dataIndex: "uname",
      key: "uname",
      width: 150,
      render: (_, record) => (
         <Space>
             <Avatar src={record.face} size="small" />
             <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222" }}>{record.uname}</a>
         </Space>
      )
    },
    {
      title: "历史收视量",
      dataIndex: "view_count",
      key: "view_count",
      width: 150,
      render: (val) => <Tag color="blue" icon={<PlayCircleOutlined />}>{(val || 0).toLocaleString()} 播放</Tag>
    },
    {
      title: "历史评论数",
      dataIndex: "reply_count",
      key: "reply_count",
      width: 150,
      render: (val) => <Tag color="purple" icon={<MessageOutlined />}>{(val || 0).toLocaleString()} 弹论</Tag>
    }
  ];

  return (
    <Card styles={{ body: { padding: isMobile ? '12px' : '24px' } }} variant="borderless" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", marginBottom: 24, gap: isMobile ? 16 : 0 }}>
        <div>
          <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>全域视频库</Title>
          <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>收录全系统监控期间捕获的所有稿件 ({total} 项)</Text>
        </div>
        <Space align="start" wrap style={{ rowGap: 16, columnGap: isMobile ? 12 : 32, width: isMobile ? '100%' : 'auto' }}>
           <Space align="center" wrap={isMobile}>
              <Text strong style={{ color: '#555', fontSize: isMobile ? 12 : 14 }}>按主播查件:</Text>
              <Search 
                 placeholder="输入 UP主昵称..." 
                 allowClear 
                 value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onSearch={() => setPagination({ ...pagination, current: 1 })} 
                 style={{ width: isMobile ? 200 : 220 }} 
                 enterButton={<SearchOutlined />}
              />
           </Space>
           
           <Space align="center" wrap={isMobile}>
              <Text strong style={{ color: '#555', fontSize: isMobile ? 12 : 14 }}>播放量区间:</Text>
              <InputNumber min={0} placeholder=">= 播放" value={minViews} onChange={setMinViews} style={{ width: 100 }} />
              <span style={{ color: '#ccc' }}>~</span>
              <InputNumber min={0} placeholder="<= 播放" value={maxViews} onChange={setMaxViews} style={{ width: 100 }} />
              <Button type="primary" onClick={() => setPagination({ ...pagination, current: 1 })}>精确过滤</Button>
              <Button onClick={resetFilters}>重置</Button>
           </Space>
           
           <Space align="center" wrap={isMobile}>
             <Text strong style={{ color: '#555', fontSize: isMobile ? 12 : 14 }}>排布法则:</Text>
             <Select value={sortField} style={{ width: 140 }} onChange={onSortChange}>
                <Option value="view_count">历史播放量</Option>
                <Option value="reply_count">总热血评论</Option>
                <Option value="pubdate">投稿发布时间</Option>
             </Select>
             <Select value={sortOrder} style={{ width: 90, marginLeft: 8 }} onChange={onSortOrderChange}>
                <Option value="DESC">最高优先</Option>
                <Option value="ASC">最低优先</Option>
             </Select>
           </Space>
        </Space>
      </div>

      {isMobile ? (
        <List
          dataSource={data}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            onChange: (page, pageSize) => handleTableChange({ current: page, pageSize }),
            size: 'small',
            showSizeChanger: false,
          }}
          split={true}
          renderItem={(item) => (
            <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', width: '100%', gap: 12 }}>
                <div style={{ flexShrink: 0 }}>
                  <img 
                    src={item.cover_pic} 
                    alt="cover" 
                    style={{ width: 140, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} 
                    referrerPolicy="no-referrer" 
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textOverflow: 'ellipsis' }}>
                    <a href={`https://www.bilibili.com/video/${item.bvid}`} target="_blank" rel="noreferrer" style={{ color: '#222', fontSize: 13, fontWeight: 600, lineHeight: '18px' }}>
                      {item.title}
                    </a>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={4} style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
                      <Avatar src={item.face} size={16} />
                      <Text type="secondary" ellipsis style={{ fontSize: 11, maxWidth: 70 }}>{item.uname}</Text>
                    </Space>
                    <Space size={8} style={{ flexShrink: 0, fontSize: 11, color: '#999' }}>
                      <span style={{ color: '#fb7299' }}><PlayCircleOutlined /> {(item.view_count || 0).toLocaleString()}</span>
                      <span><MessageOutlined /> {(item.reply_count || 0).toLocaleString()}</span>
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
          scroll={{ x: 950 }}
          onChange={handleTableChange}
          pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50']
          }}
        />
      )}
    </Card>
  );
}
