import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Card, Space, Input, Select, InputNumber, Button, message, Tooltip, Popconfirm, List, Tag } from "antd";
import { StarOutlined, StarFilled, DeleteOutlined, StopOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

export default function VtubersList() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState("uname");
  const [minVideos, setMinVideos] = useState(null);
  const [maxVideos, setMaxVideos] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  const fetchData = async (page, pageSize, searchVal, typeVal, minV, maxV) => {
    setLoading(true);
    try {
      let url = `/vtubers?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(searchVal)}&type=${typeVal}`;
      if (minV !== null && minV !== undefined) url += `&minVideos=${minV}`;
      if (maxV !== null && maxV !== undefined) url += `&maxVideos=${maxV}`;

      const response = await api.get(url);
      const payload = response.data;
      
      setData(payload.items || []);
      setTotal(payload.total || 0);
    } catch (error) {
      if (error.response?.status !== 401) {
          message.error(error.response?.data?.message || "获取数据失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePriority = async (record) => {
      try {
          const newPrio = record.priority > 0 ? 0 : 100;
          const res = await api.put(`/vtubers/${record.uid}/priority`, { priority: newPrio });
          if(res.data.success) {
              message.success(`已${newPrio > 0 ? '设为核心监控' : '取消核心监控'} (UID: ${record.uid})`);
              const newData = data.map(item => {
                  if (item.uid === record.uid) {
                      return { ...item, priority: newPrio };
                  }
                  return item;
              });
              setData(newData);
          }
      } catch (err) {
          message.error("调整权重失败");
      }
  };

  const handleDisable = async (uid, uname) => {
      try {
          // Status 0 means ban/disable
          const res = await api.put(`/vtubers/${uid}/toggle-status`, { status: 0 });
          if(res.data.success) {
              message.success(`已封禁: ${uname}，所有记录将在前端隐藏`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("封禁操作失败");
      }
  };

  const handleDelete = async (uid) => {
      try {
          const res = await api.delete(`/vtubers/${uid}`);
          if(res.data.success) {
              message.success(`主播(UID: ${uid})已从收容库抹除`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("删除失败");
      }
  };

  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, keyword, searchType, minVideos, maxVideos);
  }, [pagination.current, pagination.pageSize, keyword, searchType, minVideos, maxVideos]);

  const handleTableChange = (newPagination) => {
    setPagination({ current: newPagination.current, pageSize: newPagination.pageSize });
  };

  const handleSearch = (value) => {
    setKeyword(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const applyVideoRangeFilter = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const selectBefore = (
    <Select value={searchType} onChange={(val) => { setSearchType(val); setPagination((prev) => ({ ...prev, current: 1 })); }} style={{ width: 105 }}>
      <Option value="uname">搜昵称</Option>
      <Option value="uid">搜 UID</Option>
    </Select>
  );

  const columns = [
    {
      title: "主播基本面",
      dataIndex: "uname",
      key: "uname",
      width: 250,
      render: (text, record) => (
        <Space size="middle">
          <Avatar src={record.face} size="large" style={{ border: '1px solid #f0f0f0' }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>
              <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222" }}>{text}</a>
              <Tooltip title={record.priority > 0 ? "核心监控 (高频查岗)" : "普通监控"}>
                 <span onClick={() => togglePriority(record)} style={{ cursor: 'pointer', marginLeft: 8 }}>
                     {record.priority > 0 ? <StarFilled style={{color: '#ffc107'}} /> : <StarOutlined style={{color: '#d9d9d9'}} />}
                 </span>
              </Tooltip>
            </div>
            <Text type="secondary" style={{ fontSize: "12px" }}>UID: {record.uid}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "最新粉丝快照",
      dataIndex: "follower_count",
      key: "follower_count",
      width: 150,
      render: (val) => <Text strong style={{ color: "#1677ff", fontSize: "16px" }}>{val || 0}</Text>
    },
    {
      title: "近三月收录稿件",
      dataIndex: "video_count",
      key: "video_count",
      render: (val) => val ? <Text strong style={{color: '#eb2f96'}}>{val} 稿</Text> : <Text disabled>0 稿</Text>,
    },
    {
      title: "调度优先级",
      key: "priority",
      render: (_, record) => {
         if (record.priority > 0) return <Text strong style={{color: '#fa8c16'}}>特别核心查岗</Text>;
         return <Text disabled>普通</Text>;
      }
    },
    {
      title: "最近入库时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (val) => val ? new Date(val).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Popconfirm
            title="执行账号封禁"
            description={`确定要把 [${record.uname}] 打入冷宫并全网隐藏吗？`}
            onConfirm={() => handleDisable(record.uid, record.uname)}
            okText="封禁"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button type="primary" danger size="small" icon={<StopOutlined />}>禁用</Button>
          </Popconfirm>

          <Popconfirm
            title="抹除主播对象"
            description={`确定要把 [${record.uname}] 彻底移出监控库吗？`}
            onConfirm={() => handleDelete(record.uid)}
            okText="立即执行"
            cancelText="手滑了"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>核心监控大字典</Title>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>本调度器系统底座拥有的所有 UP 主源。数据仅展示每日收揽的静态快照结果。</Text>
      </div>

      <Card 
        styles={{ body: { padding: isMobile ? '12px' : '24px' } }}
        title={
          <Space size="large" wrap>
             <span style={{ fontWeight: 600, fontSize: "16px" }}>库内名单 ({total} 位)</span>
             <Space>
         <div>
          <Text strong style={{ marginRight: 8, fontSize: isMobile ? 12 : 14 }}>近3月稿件过滤:</Text>
          <Space wrap size="small">
            <InputNumber min={0} placeholder="最小" value={minVideos} onChange={setMinVideos} style={{ width: 70 }} />
            <span style={{ margin: "0 4px" }}>-</span>
            <InputNumber min={0} placeholder="最大" value={maxVideos} onChange={setMaxVideos} style={{ width: 70 }} />
            <Button type="primary" onClick={applyVideoRangeFilter}>生效</Button>
          </Space>
        </div>     </Space>
          </Space>
        } 
        variant="borderless" 
        style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
        extra={
          <Search addonBefore={selectBefore} placeholder="检索关键词检索 UID 探长..." allowClear onSearch={handleSearch} style={{ width: isMobile ? '100%' : 380, marginTop: isMobile ? 12 : 0 }} enterButton />
        }
      >
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
                    <Avatar src={item.face} size={56} style={{ border: '1px solid #f0f0f0' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={`https://space.bilibili.com/${item.uid}`} target="_blank" rel="noreferrer" style={{ color: '#222', fontSize: 14, fontWeight: 600 }}>{item.uname}</a>
                        <div style={{ fontSize: 12, color: '#999' }}>UID: {item.uid}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                         {item.priority > 0 && <Tag color="orange" style={{ margin: 0 }}>核心</Tag>}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                       <Space size={16} split={<span style={{ color: '#eee' }}>|</span>}>
                         <div>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>粉丝快照</div>
                            <Text strong style={{ color: "#1677ff", fontSize: "16px" }}>{item.follower_count || 0}</Text>
                         </div>
                         <div>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>近三月入库</div>
                            {item.video_count ? <Text strong style={{color: '#eb2f96'}}>{item.video_count} 稿</Text> : <Text disabled>0 稿</Text>}
                         </div>
                       </Space>
                       <Space size={8}>
                          <Popconfirm
                            title="封禁确认"
                            description="确定打入冷宫吗？"
                            onConfirm={() => handleDisable(item.uid, item.uname)}
                            okText="封禁"
                            okButtonProps={{ danger: true }}
                            cancelText="取消"
                          >
                            <Button type="primary" danger size="small" icon={<StopOutlined />}></Button>
                          </Popconfirm>
                          <Popconfirm
                            title="抹除确认"
                            description="彻底移出监控库吗？"
                            onConfirm={() => handleDelete(item.uid)}
                            okText="执行"
                            cancelText="取消"
                          >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />}></Button>
                          </Popconfirm>
                       </Space>
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table
            rowKey="uid"
            columns={columns}
            dataSource={data}
            loading={loading}
            scroll={{ x: 900 }}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total) => `系统共收容 ${total} 名人员`
            }}
          />
        )}
      </Card>
    </div>
  );
}
