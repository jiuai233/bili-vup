import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Space, Card, DatePicker, message, List, Select, Popconfirm, Button, InputNumber } from "antd";
import { HistoryOutlined, PlayCircleOutlined, MessageOutlined, StopOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import dayjs from "dayjs";
import api from '../utils/api';

const { Title, Text } = Typography;

export default function MonthlyRanking() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [listSize, setListSize] = useState(100);

  const fetchData = async (tgtMonth = selectedMonth, scaleSize = listSize) => {
    setLoading(true);
    try {
      const url = `/growth/monthly?month=${tgtMonth.format('YYYY-MM')}&limit=${scaleSize}`;
      const response = await api.get(url);
      if (response.data.success) {
        setData(response.data.items || []);
      }
    } catch (error) {
      if (error.response?.status !== 401) {
          message.error(error.response?.data?.message || "拉取月度榜单失败");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMonth, listSize);
  }, [selectedMonth, listSize]);

  const handleDisable = async (uid, uname) => {
      try {
          const res = await api.put(`/vtubers/${uid}/toggle-status`, { status: 0 });
          if(res.data.success) {
              message.success(`已大位剥夺全站拉黑: ${uname}，所有记录将在前端隐藏`);
              setData(prev => prev.filter(item => item.uid !== uid));
          }
      } catch (err) {
          message.error("封禁操作失败");
      }
  };

  const getRankBadge = (index) => {
      let color = '#d9d9d9'; // default grey
      if (index === 0) color = '#f5222d'; // Gold/Red
      if (index === 1) color = '#fa8c16'; // Silver/Orange
      if (index === 2) color = '#faad14'; // Bronze/Yellow
      return <div style={{width: 24, height: 24, borderRadius: '50%', background: color, display:'flex', alignItems:'center', justifyContent: 'center', color: '#fff', fontWeight:'bold', fontSize: 12 }}>{index+1}</div>;
  };

  const monthlyColumns = [
    {
      title: "历史排名",
      key: "rank",
      width: 80,
      render: (text, record, index) => getRankBadge(index)
    },
    {
      title: "高能视频档案 (百大收录)",
      dataIndex: "title",
      key: "title",
      width: 350,
      render: (text, record) => (
        <Space size="middle">
          <Avatar src={record.cover_pic || record.face} shape="square" size={64} style={{ border: '1px solid #f0f0f0', borderRadius: '8px' }} />
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 250 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <a href={`https://www.bilibili.com/video/${record.bvid}`} target="_blank" rel="noreferrer" style={{ color: "#2a2a3e" }} title={text}>{text}</a>
            </div>
            <Space style={{ marginTop: 4 }}>
               <Avatar src={record.face} size="small" />
               <Text type="secondary" style={{ fontSize: "12px" }}>{record.uname}</Text>
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: "历史沉淀总收视",
      dataIndex: "today_views",
      key: "today_views",
      width: 200,
      render: (val) => <Text strong style={{ color: '#eb2f96' }}>{(val || 0).toLocaleString()} 疯狂播放</Text>
    },
    {
       title: "总弹幕/评论留存",
       dataIndex: "reply_count",
       key: "reply_count",
       width: 150,
       render: (val) => <Text>{(val || 0).toLocaleString()} 弹论</Text>
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, record) => (
         <Popconfirm
            title="拉黑处刑"
            description={`确定要在榜单和全站立刻剔除 [${record.uname}] 吗？`}
            onConfirm={() => handleDisable(record.uid, record.uname)}
            okText="封禁"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button type="primary" danger size="small" icon={<StopOutlined />}>拉黑</Button>
         </Popconfirm>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 0 }}>
        <div>
          <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}><HistoryOutlined /> 月度巨献榜</Title>
          <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>摆脱信息碎片化，定位最强视频。遇见不规范用户直接神罚拉黑。</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Text strong style={{ marginRight: 8, fontSize: isMobile ? 12 : 14 }}>榜单席位：</Text>
            <InputNumber 
              min={10} 
              max={5000} 
              step={100} 
              value={listSize} 
              onChange={(val) => val && setListSize(val)} 
              onPressEnter={(e) => fetchData(selectedMonth, parseInt(e.target.value))}
              style={{ width: 110 }} 
              placeholder="100"
            />
          </div>
          <div>
            <Text strong style={{ marginRight: 8, fontSize: isMobile ? 12 : 14 }}>纪元：</Text>
            <DatePicker picker="month" value={selectedMonth} onChange={(val) => val && setSelectedMonth(val)} allowClear={false} style={{ width: isMobile ? 120 : undefined }} />
          </div>
        </div>
      </div>

      <Card styles={{ body: { padding: isMobile ? '12px' : '24px' } }} variant="borderless" style={{ borderRadius: '12px', boxShadow: '0 8px 24px rgba(250,114,152,0.1)' }}>
        {isMobile ? (
          <List
            dataSource={data}
            loading={loading}
            pagination={{ pageSize: 50, align: 'center', showSizeChanger: false }}
            split={true}
            renderItem={(item, index) => (
              <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', width: '100%', gap: 12 }}>
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 4, left: 4, background: '#fa7298', color: '#fff', fontSize: 10, padding: '0 4px', borderRadius: 4, zIndex: 10, fontWeight: 'bold' }}>
                      NO.{index + 1}
                    </div>
                    <img 
                      src={item.cover_pic || item.face} 
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
                        <span style={{ color: '#fb7299' }}><PlayCircleOutlined /> {(item.today_views || 0).toLocaleString()}</span>
                        <span><MessageOutlined /> {(item.reply_count || 0).toLocaleString()}</span>
                        <Popconfirm title="执行拉黑" description={`将 ${item.uname} 从全网剔除?`} onConfirm={() => handleDisable(item.uid, item.uname)} okText="封禁" cancelText="取消" okButtonProps={{danger: true}}>
                           <div style={{color: '#ff4d4f', cursor: 'pointer', padding: '0 2px', fontSize: 14}}><StopOutlined /></div>
                        </Popconfirm>
                      </Space>
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table scroll={{ x: 800 }} rowKey="bvid" columns={monthlyColumns} dataSource={data} loading={loading} pagination={{ pageSize: 50, showSizeChanger: true }} />
        )}
      </Card>
    </div>
  );
}
