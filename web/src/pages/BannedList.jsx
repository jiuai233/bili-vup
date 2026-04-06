import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Card, Space, Input, Select, InputNumber, Button, message, Tooltip, Popconfirm, List } from "antd";
import { CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

export default function BannedList() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState("uname");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  const fetchData = async (page, pageSize, searchVal, typeVal) => {
    setLoading(true);
    try {
      let url = `/vtubers?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(searchVal)}&type=${typeVal}&status=banned`;
      const response = await api.get(url);
      const payload = response.data;
      
      setData(payload.items || []);
      setTotal(payload.total || 0);
    } catch (error) {
      if (error.response?.status !== 401) {
          message.error(error.response?.data?.message || "获取封禁数据失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (uid, uname) => {
      try {
          const res = await api.put(`/vtubers/${uid}/toggle-status`, { status: 1 });
          if(res.data.success) {
              message.success(`已解封: ${uname}，数据现已恢复到全域`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("解封操作失败");
      }
  };

  const handleDelete = async (uid) => {
      try {
          const res = await api.delete(`/vtubers/${uid}`);
          if(res.data.success) {
              message.success(`主播(UID: ${uid})已从服务器抹除`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("删除失败");
      }
  };

  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, keyword, searchType);
  }, [pagination.current, pagination.pageSize, keyword, searchType]);

  const handleTableChange = (newPagination) => {
    setPagination({ current: newPagination.current, pageSize: newPagination.pageSize });
  };

  const handleSearch = (value) => {
    setKeyword(value);
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
          <Avatar src={record.face} size="large" style={{ border: '1px solid #f0f0f0', filter: 'grayscale(100%)' }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>
              <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222" }}>{text}</a>
            </div>
            <Text type="secondary" style={{ fontSize: "12px" }}>UID: {record.uid}</Text>
          </div>
        </Space>
      ),
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
            title="执行解封"
            description={`确定要给 [${record.uname}] 刑满释放吗？历史数据将重见天日。`}
            onConfirm={() => handleRestore(record.uid, record.uname)}
            okText="解封"
            cancelText="取消"
          >
            <Button type="primary" size="small" icon={<CheckCircleOutlined />}>恢复</Button>
          </Popconfirm>

          <Popconfirm
            title="彻底抹杀"
            description={`确定要把 [${record.uname}] 彻底移出服务器记录吗？`}
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
        <Title level={isMobile ? 5 : 4} style={{ margin: 0, color: '#f5222d' }}>封禁惩戒中心</Title>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>这批人员目前处于物理隔离状态，它们的稿件不再会出现在系统全局库与各榜单中。</Text>
      </div>

      <Card 
        styles={{ body: { padding: isMobile ? '12px' : '24px' } }}
        title={<span style={{ fontWeight: 600, fontSize: "16px" }}>隔离区名单 ({total} 位)</span>} 
        variant="borderless" 
        style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
        extra={
          <Search addonBefore={selectBefore} placeholder="检索被封禁人员 UID 或昵称" allowClear onSearch={handleSearch} style={{ width: isMobile ? '100%' : 380, marginTop: isMobile ? 12 : 0 }} enterButton />
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
                    <Avatar src={item.face} size={56} style={{ border: '1px solid #f0f0f0', filter: 'grayscale(100%)' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={`https://space.bilibili.com/${item.uid}`} target="_blank" rel="noreferrer" style={{ color: '#222', fontSize: 14, fontWeight: 600 }}>{item.uname}</a>
                      <div style={{ fontSize: 12, color: '#999' }}>UID: {item.uid}</div>
                    </div>
                    
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                       <span style={{ fontSize: 12, color: '#999' }}>狱中</span>
                       <Space size={8}>
                          <Popconfirm
                            title="执行解封"
                            description="确定释放吗？"
                            onConfirm={() => handleRestore(item.uid, item.uname)}
                            okText="解封"
                            cancelText="取消"
                          >
                            <Button type="primary" size="small" icon={<CheckCircleOutlined />}>恢复</Button>
                          </Popconfirm>
                          <Popconfirm
                            title="彻底抹杀"
                            description="要从此服务器抹除吗？"
                            onConfirm={() => handleDelete(item.uid)}
                            okText="执行"
                            cancelText="手滑了"
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
            scroll={{ x: 700 }}
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
    </div>
  );
}
